import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_

from database import get_db
import models, schemas
from auth import get_current_business
from services.matching import score_resource
from services.conflict_check import has_conflicting_booking

router = APIRouter(prefix="/resources", tags=["resources"])


@router.post("", response_model=schemas.ResourceOut, status_code=201)
def create_resource(
    payload: schemas.ResourceCreate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    if not current.verified:
        raise HTTPException(
            status_code=403,
            detail="Business Verification Required: Only verified businesses with approved statutory proofs can list resources on Rivora. Please complete verification in your profile or dashboard."
        )

    data = payload.model_dump()
    raw_images = data.get("images")
    if isinstance(raw_images, list):
        if not data.get("image_url") and len(raw_images) > 0:
            data["image_url"] = raw_images[0]
        data["images"] = json.dumps(raw_images)
    elif isinstance(raw_images, str):
        data["images"] = raw_images

    if data.get("image_url") and not data.get("images"):
        data["images"] = json.dumps([data["image_url"]])

    resource = models.Resource(provider_id=current.id, **data)
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return format_resource_out(resource)


def format_resource_out(r: models.Resource) -> schemas.ResourceOut:
    out = schemas.ResourceOut.model_validate(r)
    out.provider_name = r.provider.name if r.provider else None
    out.provider_verified = bool(r.provider.verified) if r.provider else False
    parsed_images = []
    if r.images:
        try:
            parsed = json.loads(r.images)
            if isinstance(parsed, list):
                parsed_images = [str(x) for x in parsed if x]
            elif isinstance(parsed, str):
                parsed_images = [parsed]
        except Exception:
            parsed_images = [x.strip() for x in r.images.split(",") if x.strip()]
    if not parsed_images and r.image_url:
        parsed_images = [r.image_url]
    out.images = parsed_images
    if not out.image_url and parsed_images:
        out.image_url = parsed_images[0]
    return out


@router.get("/search", response_model=list[schemas.ResourceOut])
def search_resources(
    type: Optional[str] = None,
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    budget: Optional[float] = None,
    min_capacity: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Filters resources by type/location/capacity/budget, drops any resource
    already confirmed-booked for the requested window, then ranks the
    survivors by the weighted matching score (price, distance, rating,
    availability) so the best match is first.
    """
    query = db.query(models.Resource).filter(models.Resource.status == "active")

    if type:
        query = query.filter(models.Resource.type == type)
    if location:
        query = query.filter(models.Resource.location.ilike(f"%{location}%"))
    if min_capacity:
        query = query.filter(
            (models.Resource.capacity == None) | (models.Resource.capacity >= min_capacity)  # noqa: E711
        )

    candidates = query.all()

    # drop anything already confirmed-booked for the requested window
    if start_time and end_time:
        candidates = [
            r for r in candidates
            if not has_conflicting_booking(db, r.id, start_time, end_time)
        ]

    ranked = []
    for r in candidates:
        out = format_resource_out(r)
        out.match_score = score_resource(r, lat, lon, budget)
        ranked.append(out)

    ranked.sort(key=lambda x: x.match_score, reverse=True)
    return ranked


@router.get("/mine/list", response_model=list[schemas.ResourceOut])
def my_resources(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    resources = db.query(models.Resource).filter(models.Resource.provider_id == current.id).all()
    return [format_resource_out(r) for r in resources]


@router.get("/{resource_id}/booked-slots")
def get_resource_booked_slots(resource_id: int, db: Session = Depends(get_db)):
    bookings = (
        db.query(models.Booking)
        .filter(
            models.Booking.resource_id == resource_id,
            models.Booking.status.in_(["confirmed", "accepted", "completed", "blocked"])
        )
        .all()
    )
    res = db.query(models.Resource).filter(models.Resource.id == resource_id).first()
    provider_id = res.provider_id if res else None
    return [
        {
            "id": b.id,
            "start_time": b.start_time.isoformat(),
            "end_time": b.end_time.isoformat(),
            "status": b.status,
            "is_blocked_by_owner": bool(b.notes == "Blocked by provider" or b.status == "blocked" or (provider_id and b.seeker_id == provider_id)),
        }
        for b in bookings
    ]


@router.get("/{resource_id}", response_model=schemas.ResourceOut)
def get_resource(resource_id: int, db: Session = Depends(get_db)):
    resource = db.query(models.Resource).filter(models.Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return format_resource_out(resource)


@router.patch("/{resource_id}", response_model=schemas.ResourceOut)
def update_resource(
    resource_id: int,
    payload: schemas.ResourceUpdate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    resource = db.query(models.Resource).filter(models.Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if resource.provider_id != current.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this resource")

    data = payload.model_dump(exclude_unset=True)
    if "images" in data:
        raw_images = data["images"]
        if isinstance(raw_images, list):
            if not data.get("image_url") and len(raw_images) > 0:
                data["image_url"] = raw_images[0]
            data["images"] = json.dumps(raw_images)
        elif isinstance(raw_images, str):
            data["images"] = raw_images

    for k, v in data.items():
        setattr(resource, k, v)

    db.commit()
    db.refresh(resource)
    return format_resource_out(resource)


class ToggleBlockDateIn(BaseModel):
    date: str  # YYYY-MM-DD


@router.post("/{resource_id}/toggle-block-date")
def toggle_block_date(
    resource_id: int,
    payload: ToggleBlockDateIn,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    resource = db.query(models.Resource).filter(models.Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if resource.provider_id != current.id:
        raise HTTPException(status_code=403, detail="Not authorized to manage this resource")

    try:
        dt = datetime.strptime(payload.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    start_dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end_dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)

    existing_block = (
        db.query(models.Booking)
        .filter(
            models.Booking.resource_id == resource_id,
            models.Booking.seeker_id == current.id,
            models.Booking.start_time <= end_dt,
            models.Booking.end_time >= start_dt,
            models.Booking.notes == "Blocked by provider",
        )
        .first()
    )

    if existing_block:
        db.delete(existing_block)
        db.commit()
        return {"blocked": False, "date": payload.date, "message": "Date unblocked"}

    active_client_booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.resource_id == resource_id,
            models.Booking.seeker_id != current.id,
            models.Booking.status.in_(["confirmed", "accepted", "completed"]),
            models.Booking.start_time <= end_dt,
            models.Booking.end_time >= start_dt,
        )
        .first()
    )
    if active_client_booking:
        raise HTTPException(status_code=400, detail="Cannot block a date that already has a confirmed client booking")

    block_booking = models.Booking(
        resource_id=resource_id,
        seeker_id=current.id,
        start_time=start_dt,
        end_time=end_dt,
        status="confirmed",
        notes="Blocked by provider",
    )
    db.add(block_booking)
    db.commit()
    return {"blocked": True, "date": payload.date, "message": "Date blocked"}


@router.delete("/{resource_id}", status_code=204)
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    resource = db.query(models.Resource).filter(models.Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if resource.provider_id != current.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this resource")

    db.delete(resource)
    db.commit()
    return None
