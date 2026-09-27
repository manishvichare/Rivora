"""Atmospheric intelligence API for Rivora's provider and seeker dashboards."""

import asyncio
import logging
import time
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import JWT_ALGORITHM, JWT_SECRET_KEY
from database import get_db
import models
from services.weather_alerts import resource_advisories

from services.local_signals import get_local_signals

router = APIRouter(tags=["weather-intelligence"])
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
optional_oauth = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
logger = logging.getLogger(__name__)
WEATHER_CACHE_SECONDS = 12 * 60
_weather_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_weather_lock = asyncio.Lock()
_weather_rate_limited_until = 0.0


@router.get("/resource-alerts")
async def get_resource_weather_alerts(
    resource_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
    token: str | None = Depends(optional_oauth),
):
    """Live coordinate-level advisories for visible marketplace listings."""
    ids = list(dict.fromkeys(resource_ids))[:40]
    if not ids:
        return {"alerts": {}, "updated_at": datetime.now().astimezone().isoformat()}
    resources = db.query(models.Resource).filter(models.Resource.id.in_(ids), models.Resource.status == "active").all()
    alerts = await resource_advisories(db, resources)
    viewer_id = None
    if token:
        try:
            viewer_id = int(jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM]).get("sub"))
        except (JWTError, TypeError, ValueError):
            viewer_id = None
    if viewer_id:
        for resource_id, alert in alerts.items():
            key = f"/weather-alert/{resource_id}:{alert['window_start']}"
            exists = db.query(models.Notification.id).filter(
                models.Notification.business_id == viewer_id,
                models.Notification.category == "weather",
                models.Notification.link_url == key,
            ).first()
            if not exists:
                db.add(models.Notification(
                    business_id=viewer_id,
                    category="weather",
                    title=f"Rain advisory · {alert['resource_name']}",
                    message=f"{alert['message']} Forecast amount: {alert['precipitation_mm'] if alert['precipitation_mm'] is not None else 'unavailable'} mm.",
                    link_url=key,
                    read=False,
                ))
        db.commit()
    return {"alerts": alerts, "updated_at": datetime.now().astimezone().isoformat(), "source": "Open-Meteo"}


def describe_weather(code: int | None) -> tuple[str, str]:
    if code == 0:
        return "Clear Sky", "☀️"
    if code in (1, 2, 3):
        return "Partly Cloudy", "⛅"
    if code in (45, 48):
        return "Fog", "🌫️"
    if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67):
        return "Rain Showers", "🌧️"
    if code in (80, 81, 82):
        return "Heavy Rain", "🌧️"
    if code in (95, 96, 99):
        return "Thunderstorm", "⛈️"
    if code in (71, 73, 75, 77, 85, 86):
        return "Snow", "❄️"
    return "Conditions unavailable", "🌡️"


def _risk_thresholds(rain: float, wind: float) -> tuple[dict, dict]:
    if rain < 5:
        flood = {"level": "Normal", "color": "#10B981", "message": "Rainfall is below Rivora's advisory threshold"}
    elif rain <= 20:
        flood = {"level": "Waterlogging Advisory", "color": "#F59E0B", "message": "Rivora estimate: monitor low-lying roads and venue access"}
    else:
        flood = {"level": "Critical Warning", "color": "#EF4444", "message": "Rivora estimate: heavy rainfall may disrupt roads and low-lying facilities"}
    storm = (
        {"level": "High Wind Squall Alert", "color": "#EF4444"}
        if wind >= 35 else {"level": "Stable Wind Baseline", "color": "#10B981"}
    )
    return flood, storm


def _fallback_payload(lat: float, lon: float, city: str) -> dict:
    now = datetime.now().astimezone().replace(minute=0, second=0, microsecond=0)
    timeline = []
    for hour in range(6):
        label, icon = describe_weather(2)
        timeline.append({
            "time": (now + timedelta(hours=hour)).isoformat(),
            "temperature_c": None,
            "precipitation_probability_percent": None,
            "weather_code": None,
            "condition": label,
            "icon": icon,
        })
    flood, storm = _risk_thresholds(0, 0)
    return {
        "city": city,
        "coordinates": {"lat": lat, "lon": lon},
        "temperature_c": None,
        "apparent_temperature_c": None,
        "relative_humidity_percent": None,
        "precipitation_mm_per_hr": None,
        "rain_mm_per_hr": None,
        "wind_speed_kmh": None,
        "weather_code": None,
        "condition": "Weather feed unavailable",
        "weather_icon": "🌡️",
        "flood_risk": flood,
        "storm_risk": storm,
        "risk_notice": "Threshold-based Rivora estimate from Open-Meteo model data; follow official IMD alerts for warnings.",
        "timeline": timeline,
        "observed_at": None,
        "weather_source": "Open-Meteo",
        "status": "Demo Fallback",
    }


async def _fetch_weather_from_open_meteo(lat: float, lon: float, city: str) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m",
        "hourly": "temperature_2m,precipitation_probability,weather_code",
        # Two dates guarantee a complete next-six-hour strip near local midnight.
        "forecast_days": 2,
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        current = payload["current"]
        hourly = payload.get("hourly", {})
        current_time = current.get("time", "")
        times = hourly.get("time", [])
        start_index = next((index for index, stamp in enumerate(times) if stamp >= current_time[:13]), 0)
        timeline = []
        for index in range(start_index, min(start_index + 6, len(times))):
            code = hourly.get("weather_code", [None] * len(times))[index]
            label, icon = describe_weather(code)
            probability = hourly.get("precipitation_probability", [None] * len(times))[index]
            temperature = hourly.get("temperature_2m", [None] * len(times))[index]
            timeline.append({
                "time": times[index],
                "temperature_c": temperature,
                "precipitation_probability_percent": probability,
                "weather_code": code,
                "condition": label,
                "icon": icon,
            })
        rain = float(current.get("rain") if current.get("rain") is not None else current.get("precipitation") or 0)
        wind = float(current.get("wind_speed_10m") or 0)
        condition, icon = describe_weather(current.get("weather_code"))
        flood, storm = _risk_thresholds(rain, wind)
        return {
            "city": city,
            "coordinates": {"lat": lat, "lon": lon},
            "temperature_c": current.get("temperature_2m"),
            "apparent_temperature_c": current.get("apparent_temperature"),
            "relative_humidity_percent": current.get("relative_humidity_2m"),
            "precipitation_mm_per_hr": current.get("precipitation"),
            "rain_mm_per_hr": rain,
            "wind_speed_kmh": wind,
            "weather_code": current.get("weather_code"),
            "condition": condition,
            "weather_icon": icon,
            "flood_risk": flood,
            "storm_risk": storm,
            "risk_notice": "Threshold-based Rivora estimate from Open-Meteo model data; follow official IMD alerts for warnings.",
            "timeline": timeline,
            "observed_at": current_time,
            "weather_source": "Open-Meteo",
            "status": "Live Connected",
        }
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            global _weather_rate_limited_until
            try:
                retry_after = max(60, int(exc.response.headers.get("Retry-After", "60")))
            except ValueError:
                retry_after = 60
            _weather_rate_limited_until = time.monotonic() + retry_after
            fallback = _fallback_payload(lat, lon, city)
            fallback.update({"status": "Rate Limited", "retry_after_seconds": retry_after})
            logger.warning("Open-Meteo rate limit (429) for %.4f, %.4f; pausing requests for %s seconds", lat, lon, retry_after)
            return fallback
        logger.warning("Open-Meteo request failed for %.4f, %.4f: %s", lat, lon, exc)
        return _fallback_payload(lat, lon, city)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        logger.warning("Open-Meteo request failed for %.4f, %.4f: %s", lat, lon, exc)
        return _fallback_payload(lat, lon, city)


def _cached_weather_response(lat: float, lon: float, city: str, cached: tuple[float, dict], *, stale: bool, retry_after: int = 0) -> dict:
    fetched_at, payload = cached
    response = {**payload, "city": city, "coordinates": {"lat": lat, "lon": lon}}
    response["cache_age_minutes"] = max(0, int((time.monotonic() - fetched_at) // 60))
    if stale:
        response["status"] = "Cached"
        response["retry_after_seconds"] = retry_after
    return response


async def _fetch_weather(lat: float, lon: float, city: str) -> dict:
    """Cache forecasts and serialize misses so concurrent pages share one upstream request."""
    key = (round(lat, 3), round(lon, 3))
    now = time.monotonic()
    cached = _weather_cache.get(key)
    if cached and now - cached[0] < WEATHER_CACHE_SECONDS:
        return _cached_weather_response(lat, lon, city, cached, stale=False)

    async with _weather_lock:
        now = time.monotonic()
        cached = _weather_cache.get(key)
        if cached and now - cached[0] < WEATHER_CACHE_SECONDS:
            return _cached_weather_response(lat, lon, city, cached, stale=False)

        retry_after = max(0, int(_weather_rate_limited_until - now))
        if retry_after:
            if cached:
                return _cached_weather_response(lat, lon, city, cached, stale=True, retry_after=retry_after)
            fallback = _fallback_payload(lat, lon, city)
            fallback.update({"status": "Rate Limited", "retry_after_seconds": retry_after})
            return fallback

        payload = await _fetch_weather_from_open_meteo(lat, lon, city)
        if payload.get("status") == "Live Connected":
            _weather_cache[key] = (time.monotonic(), payload)
        elif payload.get("status") == "Rate Limited":
            cached = _weather_cache.get(key)
            if cached:
                return _cached_weather_response(lat, lon, city, cached, stale=True, retry_after=payload.get("retry_after_seconds", 60))
        return payload


@router.get("/intel")
async def atmospheric_intelligence(
    lat: float = Query(default=18.9894, ge=-90, le=90),
    lon: float = Query(default=73.1175, ge=-180, le=180),
    city: str = Query(default="Navi Mumbai", min_length=1, max_length=80),
):
    """Combine coordinate-level weather, a six-hour forecast, and local news."""
    city = city.strip() or "Navi Mumbai"
    weather, signals = await asyncio.gather(_fetch_weather(lat, lon, city), get_local_signals(city))
    return {
        **weather,
        "signals": signals["signals"],
        "signals_source": signals["provider"],
        "signals_are_demo": signals["is_demo"],
        "updated_at": datetime.now().astimezone().isoformat(),
    }
