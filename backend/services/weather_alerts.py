"""Coordinate-specific rain advisories for weather-sensitive listings."""

import asyncio
import math
import time
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

import models

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
ALERT_THRESHOLD = 50
_forecast_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_request_limit = asyncio.Semaphore(5)


def is_weather_sensitive(resource: models.Resource) -> bool:
    """Conservative keyword classification; unknown listings do not get rain claims."""
    text = " ".join(filter(None, [resource.type, resource.name, resource.description, resource.conditions_text])).lower()
    exposure_terms = ("outdoor", "open air", "open-air", "uncovered", "garden", "lawn", "rooftop", "terrace", "field", "grounds", "open ground", "parking")
    indoor_terms = ("indoor", "covered", "enclosed", "conference room")
    explicit_open = any(term in text for term in ("outdoor", "open air", "open-air", "uncovered", "open banquet", "open hall"))
    if any(term in text for term in indoor_terms) and not explicit_open:
        return False
    return any(term in text for term in exposure_terms)


async def _forecast(lat: float, lon: float) -> dict | None:
    key = (round(lat, 3), round(lon, 3))
    cached = _forecast_cache.get(key)
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    params = {
        "latitude": lat, "longitude": lon, "current": "precipitation", "hourly": "precipitation_probability,precipitation",
        "forecast_days": 2, "timezone": "auto",
    }
    try:
        async with _request_limit:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(OPEN_METEO_URL, params=params)
                response.raise_for_status()
                body = response.json()
        times = body["hourly"]["time"]
        probabilities = body["hourly"]["precipitation_probability"]
        amounts = body["hourly"]["precipitation"]
        current_stamp = body.get("current", {}).get("time")
        index = next((i for i, stamp in enumerate(times) if current_stamp and stamp > current_stamp), None)
        if index is None:
            return None
        result = {
            "probability_percent": probabilities[index],
            "precipitation_mm": amounts[index],
            "window_start": times[index],
            "window_end": times[index + 1] if index + 1 < len(times) else None,
            "observed_at": body.get("current", {}).get("time"),
            "source": "Open-Meteo",
        }
        _forecast_cache[key] = (time.monotonic(), result)
        return result
    except (httpx.HTTPError, KeyError, TypeError, ValueError, IndexError):
        return None


def _alternatives(db: Session, resource: models.Resource) -> list[dict]:
    candidates = db.query(models.Resource).filter(models.Resource.status == "active", models.Resource.id != resource.id).all()
    found = []
    for candidate in candidates:
        if is_weather_sensitive(candidate):
            continue
        resource_coords, candidate_coords = _coordinates(resource), _coordinates(candidate)
        if resource_coords and candidate_coords:
            lat1, lat2 = math.radians(resource_coords[0]), math.radians(candidate_coords[0])
            dlat = lat2 - lat1
            dlon = math.radians(candidate_coords[1] - resource_coords[1])
            a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
            distance = 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            if distance > 25:
                continue
        else:
            distance = None
            if not (candidate.location and resource.location and candidate.location.lower() == resource.location.lower()):
                continue
        found.append({"id": candidate.id, "name": candidate.name, "location": candidate.location, "distance_km": round(distance, 1) if distance is not None else None, "url": f"resource-details.html?id={candidate.id}"})
    found.sort(key=lambda item: item["distance_km"] if item["distance_km"] is not None else 0)
    return found[:3]


def _coordinates(resource: models.Resource) -> tuple[float, float] | None:
    latitude = resource.latitude if resource.latitude is not None else (resource.provider.latitude if resource.provider else None)
    longitude = resource.longitude if resource.longitude is not None else (resource.provider.longitude if resource.provider else None)
    if latitude is None or longitude is None:
        return None
    return float(latitude), float(longitude)


async def resource_advisories(db: Session, resources: list[models.Resource]) -> dict[str, dict]:
    relevant = [r for r in resources if r.status == "active" and is_weather_sensitive(r) and _coordinates(r) is not None]
    coords = {(round(_coordinates(r)[0], 3), round(_coordinates(r)[1], 3)) for r in relevant}
    forecasts = await asyncio.gather(*(_forecast(lat, lon) for lat, lon in coords))
    forecast_by_coord = dict(zip(coords, forecasts))
    result = {}
    for resource in relevant:
        lat, lon = _coordinates(resource)
        forecast = forecast_by_coord.get((round(lat, 3), round(lon, 3)))
        if not forecast or forecast["probability_percent"] is None or forecast["probability_percent"] < ALERT_THRESHOLD:
            continue
        result[str(resource.id)] = {
            "resource_id": resource.id,
            "resource_name": resource.name,
            "probability_percent": int(forecast["probability_percent"]),
            "precipitation_mm": forecast["precipitation_mm"],
            "window_start": forecast["window_start"],
            "window_end": forecast["window_end"],
            "observed_at": forecast["observed_at"],
            "source": forecast["source"],
            "message": f"Rain is forecast at {int(forecast['probability_percent'])}% for this location during the next forecast hour.",
            "alternatives": _alternatives(db, resource),
        }
    return result


async def refresh_weather_notifications(db: Session, business_id: int) -> None:
    """Refresh this account's listing/booking notices when its notification bar loads."""
    resources = db.query(models.Resource).filter(models.Resource.provider_id == business_id, models.Resource.status == "active").all()
    bookings = db.query(models.Booking).filter(
        models.Booking.seeker_id == business_id,
        models.Booking.status.in_(["pending", "negotiating", "confirmed"]),
        models.Booking.end_time >= datetime.now(),
    ).all()
    resources_by_id = {r.id: r for r in resources}
    for booking in bookings:
        if booking.resource and booking.resource.id not in resources_by_id:
            resources_by_id[booking.resource.id] = booking.resource
    advisories = await resource_advisories(db, list(resources_by_id.values()))
    resource_ids = set(resources_by_id)

    # Weather advisories are temporary: mark notices from past forecast hours as read.
    old_weather = db.query(models.Notification).filter(
        models.Notification.business_id == business_id,
        models.Notification.category == "weather",
        models.Notification.read.is_(False),
        models.Notification.created_at < datetime.utcnow() - timedelta(minutes=90),
    ).all()
    for notification in old_weather:
        notification.read = True

    for resource_id in resource_ids:
        alert = advisories.get(str(resource_id))
        if not alert:
            continue
        resource = resources_by_id[resource_id]
        recipients = {resource.provider_id}
        recipients.update(b.seeker_id for b in bookings if b.resource_id == resource_id)
        notice_key = f"{resource_id}:{alert['window_start']}"
        for recipient_id in recipients:
            exists = db.query(models.Notification.id).filter(
                models.Notification.business_id == recipient_id,
                models.Notification.category == "weather",
                models.Notification.link_url == f"/weather-alert/{notice_key}",
            ).first()
            if exists:
                continue
            db.add(models.Notification(
                business_id=recipient_id,
                category="weather",
                title=f"Rain advisory · {resource.name}",
                message=f"{alert['message']} Forecast amount: {alert['precipitation_mm'] if alert['precipitation_mm'] is not None else 'unavailable'} mm.",
                link_url=f"/weather-alert/{notice_key}",
                read=False,
            ))
    db.commit()
