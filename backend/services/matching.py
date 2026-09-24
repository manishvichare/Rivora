import math
from typing import Optional
import models


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in km between two lat/lon points."""
    if None in (lat1, lon1, lat2, lon2):
        return 9999.0  # unknown location -> treat as far away, not a crash
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def score_resource(
    resource: models.Resource,
    seeker_lat: Optional[float],
    seeker_lon: Optional[float],
    budget: Optional[float],
    weights: dict | None = None,
) -> float:
    """
    Weighted matching score, each factor normalized to roughly [0, 1]:

      price_fit        - 1.0 if within budget, decays as price exceeds budget
      distance_fit      - 1.0 when very close, decays with distance
      rating_fit        - placeholder 0.8 until reviews are aggregated per resource
      availability_fit  - 1.0 here; the search endpoint has already filtered out
                           resources with a conflicting confirmed booking, so any
                           surviving resource is fully available for the window

    Weights are intentionally simple and can be tuned or exposed to the
    frontend as sort preferences (e.g. "prioritize budget").
    """
    w = weights or {"price": 0.35, "distance": 0.30, "rating": 0.20, "availability": 0.15}

    price = float(resource.price_per_unit)
    if budget is None or budget <= 0:
        price_fit = 0.7  # neutral score when the seeker gave no budget
    elif price <= budget:
        price_fit = 1.0
    else:
        price_fit = max(0.0, 1 - (price - budget) / budget)

    dist_km = haversine_km(seeker_lat, seeker_lon, resource.latitude, resource.longitude)
    distance_fit = max(0.0, 1 - min(dist_km, 50) / 50)  # 0 at >=50km, 1 at 0km

    rating_fit = 0.8  # TODO: replace with AVG(reviews.rating) per resource once volume exists

    availability_fit = 1.0

    score = (
        w["price"] * price_fit
        + w["distance"] * distance_fit
        + w["rating"] * rating_fit
        + w["availability"] * availability_fit
    )
    return round(score, 4)
