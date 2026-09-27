"""Weather-driven, non-persistent Digital Twin simulation for Rivora."""

from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from services.local_signals import get_local_signals

router = APIRouter(tags=["digital-twin"])

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_PARAMS = {
    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m",
    "forecast_days": 1,
}


class SimulationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    rainfall_intensity: float = Field(
        ge=0, le=100, validation_alias=AliasChoices("rainfall_intensity", "rainfall_intensity_mm"),
        description="Rainfall intensity in mm per hour",
    )
    storm_duration: float = Field(
        ge=1, le=6, validation_alias=AliasChoices("storm_duration", "storm_duration_hours"),
    )
    lat: float = Field(default=19.0330, ge=-90, le=90)
    lon: float = Field(default=73.0297, ge=-180, le=180)
    zone: str = Field(default="Navi Mumbai", min_length=2, max_length=80)


class AffectedEntity(BaseModel):
    name: str
    resource_type: Literal["indoor_venue", "outdoor_venue", "parking", "staff", "equipment"]
    normal_state: str
    simulated_state: str
    normal_capacity: int | None = None
    simulated_demand: int | None = None
    impact_probability: float = Field(ge=0, le=100)


class SimulationResponse(BaseModel):
    zone: str
    coordinates: dict[str, float]
    rainfall_intensity: float
    storm_duration: float
    rainfall_intensity_mm: float
    storm_duration_hours: float
    outdoor_cancellation_risk: float
    indoor_demand_surge_multiplier: float
    parking_flood_risk: dict
    staff_transit_delay_factor: float
    dynamic_pricing_surge: float
    affected_entities: list[AffectedEntity]
    zeus_ai_recommendation: str
    confidence_interval: dict
    simulated_at: datetime


def weather_description(code: int | None, rain: float) -> str:
    descriptions = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
        55: "Dense drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle",
        61: "Light rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain",
        67: "Heavy freezing rain", 71: "Light snowfall", 73: "Moderate snowfall",
        75: "Heavy snowfall", 77: "Snow grains", 80: "Light rain showers",
        81: "Moderate rain showers", 82: "Violent rain showers", 85: "Snow showers",
        86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail",
        99: "Heavy thunderstorm with hail",
    }
    if code in descriptions:
        return descriptions[code]
    if rain >= 25:
        return "Heavy rain"
    if rain >= 5:
        return "Moderate rain"
    if rain > 0:
        return "Passing showers"
    return "Conditions unavailable"


async def fetch_live_weather(lat: float = 19.0330, lon: float = 73.0297, zone: str = "Navi Mumbai") -> dict:
    """Fetch current weather observations for a requested coordinate."""
    params = {**OPEN_METEO_PARAMS, "latitude": lat, "longitude": lon}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            data = response.json()
            current = data.get("current", {})
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Live weather is temporarily unavailable") from exc

    rain = float(current.get("rain") or current.get("precipitation") or 0)
    wind = float(current.get("wind_speed_10m") or 0)
    code = current.get("weather_code")
    if rain < 5:
        flood = {"level": "Normal", "color": "#10B981", "message": "No localized street flooding expected"}
    elif rain <= 20:
        flood = {"level": "Waterlogging Advisory", "color": "#F59E0B", "message": "Localized waterlogging is possible; monitor low-lying routes"}
    else:
        flood = {"level": "Severe Flood Warning", "color": "#EF4444", "message": "Severe rainfall may cause flash flooding; avoid vulnerable lots"}
    storm = (
        {"level": "Squall / Storm Advisory", "color": "#EF4444"}
        if wind >= 35 else {"level": "Clear", "color": "#10B981"}
    )
    return {
        "zone": zone,
        "coordinates": {"lat": lat, "lon": lon},
        "temperature_c": current.get("temperature_2m"),
        "apparent_temperature_c": current.get("apparent_temperature"),
        "relative_humidity_percent": current.get("relative_humidity_2m"),
        "rainfall_mm_per_hr": rain,
        "wind_speed_kmh": wind,
        "wind_gusts_kmh": current.get("wind_gusts_10m"),
        "weather_code": code,
        "weather_condition": weather_description(code, rain),
        "flood_alert": flood,
        "storm_alert": storm,
        "observed_at": current.get("time"),
        "status": "Live Connected",
        "source": "Open-Meteo",
        # Compatibility fields for callers of the original endpoint.
        "location": zone,
        "rain_rate_mm_per_hour": rain,
        "weather_status": weather_description(code, rain),
        "baseline_operational_risk": "Critical" if rain > 20 or wind >= 35 else "Elevated" if rain >= 5 else "Normal",
    }


@router.get("/live-telemetry")
async def live_telemetry(
    lat: float | None = Query(default=None, ge=-90, le=90),
    lon: float | None = Query(default=None, ge=-180, le=180),
    zone: str = Query(default="Current Location", min_length=2, max_length=80),
):
    normalized_zone = zone.strip() or "Current Location"
    zone_key = normalized_zone.casefold()
    if lat is None:
        lat = 18.9894 if zone_key == "panvel" else 19.0330
    if lon is None:
        lon = 73.1175 if zone_key == "panvel" else 73.0297
    return await fetch_live_weather(lat, lon, normalized_zone)


@router.get("/live-weather")
async def live_weather():
    """Backward-compatible default Navi Mumbai weather endpoint."""
    return await fetch_live_weather()


@router.get("/social-signals")
async def social_signals(city: str = Query(default="Navi Mumbai", min_length=1, max_length=80)):
    """Return recent local reports; explicitly marks sample fallback data."""
    result = await get_local_signals(city)
    return result["signals"]


@router.post("/simulate", response_model=SimulationResponse)
async def simulate_scenario(payload: SimulationRequest):
    rain = payload.rainfall_intensity
    duration = payload.storm_duration

    # Piecewise response models a sharp increase in outdoor disruption above
    # 25 mm/h while retaining a gradual response for lighter rainfall.
    outdoor_risk = min(99.0, rain * 3.0) if rain <= 25 else min(99.0, 82.0 + (rain - 25.0) * 0.55 + (duration - 1.0) * 0.65)
    outdoor_risk = round(outdoor_risk, 1)
    indoor_surge = round(min(2.4, 1.0 + (rain / 100.0) * (0.75 + duration * 0.46)), 2)
    zone_is_low_lying = (
        any(term in payload.zone.lower() for term in ("navi", "panvel", "thane", "coastal", "low-lying"))
        or (18.8 <= payload.lat <= 19.4 and 72.7 <= payload.lon <= 73.3)
    )
    flood_probability = min(98.0, max(4.0, rain * 1.15 + duration * 4.0 + (18.0 if zone_is_low_lying else 0.0)))
    staff_delay = round(min(78.0, rain * 0.42 + duration * 3.2), 1)
    pricing_surge = round(1.10 + min(0.25, max(0.0, indoor_surge - 1.0) * 0.20), 2)

    entities = [
        AffectedEntity(name="GrandVista Banquet Hall", resource_type="indoor_venue", normal_state="Available · 180 seats", simulated_state=f"Surge: Relocation influx · {indoor_surge:.2f}x demand", normal_capacity=180, simulated_demand=round(110 * indoor_surge), impact_probability=round(min(96, 48 + (indoor_surge - 1) * 30), 1)),
        AffectedEntity(name="Bayview Garden Lawn", resource_type="outdoor_venue", normal_state="Available · 220 guests", simulated_state="Warning: Outdoor event cancellation risk", normal_capacity=220, simulated_demand=round(220 * (1 - outdoor_risk / 100)), impact_probability=outdoor_risk),
        AffectedEntity(name="Parking B", resource_type="parking", normal_state="Available · 60 spaces", simulated_state="Warning: Flash flood risk" if flood_probability >= 35 else "Monitor: Surface water risk", normal_capacity=60, simulated_demand=48, impact_probability=round(flood_probability, 1)),
        AffectedEntity(name="Hospitality response crew", resource_type="staff", normal_state="On schedule", simulated_state=f"Transit delay: {staff_delay:.0f}% of staff", impact_probability=round(min(95, staff_delay + 12), 1)),
        AffectedEntity(name="Outdoor event equipment pool", resource_type="equipment", normal_state="Available", simulated_state="Relocate covered equipment; protect electrical inventory", impact_probability=round(min(99, outdoor_risk + 5), 1)),
    ]
    recommendation = (
        f"Reallocate 45 covered parking spots from Bayview to GrandVista, open standby indoor banquet capacity, "
        f"and notify suppliers to stage arrivals with a {staff_delay:.0f}% transit-delay buffer."
    )
    uncertainty = {
        "outdoor_cancellation_risk_pct": [round(max(0, outdoor_risk - 8), 1), round(min(100, outdoor_risk + 8), 1)],
        "indoor_demand_multiplier": [round(max(1, indoor_surge - 0.15), 2), round(min(2.4, indoor_surge + 0.15), 2)],
        "note": "Scenario estimates use prototype heuristics; actual outcomes depend on venue, drainage, and transit conditions.",
    }
    return SimulationResponse(
        zone=payload.zone,
        coordinates={"lat": payload.lat, "lon": payload.lon},
        rainfall_intensity=rain,
        storm_duration=duration,
        rainfall_intensity_mm=rain,
        storm_duration_hours=duration,
        outdoor_cancellation_risk=outdoor_risk,
        indoor_demand_surge_multiplier=indoor_surge,
        parking_flood_risk={"at_risk": flood_probability >= 35, "probability_percent": round(flood_probability, 1), "vulnerable_assets": ["basement parking", "ground-level lots"] if zone_is_low_lying else ["ground-level lots"]},
        staff_transit_delay_factor=staff_delay,
        dynamic_pricing_surge=pricing_surge,
        affected_entities=entities,
        zeus_ai_recommendation=recommendation,
        confidence_interval=uncertainty,
        simulated_at=datetime.now(timezone.utc),
    )
