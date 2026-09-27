from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import get_current_business

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _review_out(review: models.Review) -> dict:
    booking = review.booking
    resource = booking.resource if booking else None
    seeker = booking.seeker if booking else None
    provider = resource.provider if resource else None
    return {
        "id": review.id,
        "booking_id": review.booking_id,
        "reviewer_id": review.reviewer_id,
        "reviewer_name": seeker.name if seeker else "Verified customer",
        "rating": review.rating,
        "comment": review.comment,
        "created_at": review.created_at,
        "resource_name": resource.name if resource else None,
        "provider_name": provider.name if provider else None,
    }


@router.post("", response_model=schemas.ReviewOut, status_code=201)
def create_review(
    payload: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    booking = db.query(models.Booking).filter(models.Booking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != "completed":
        raise HTTPException(status_code=400, detail="Reviews are available only after a booking is completed.")
    if booking.seeker_id != current.id:
        raise HTTPException(status_code=403, detail="Only the customer who completed this booking can review the provider.")

    existing = db.query(models.Review).filter(models.Review.booking_id == payload.booking_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="This booking has already been reviewed.")

    review = models.Review(
        booking_id=booking.id,
        reviewer_id=current.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return _review_out(review)


@router.get("/mine", response_model=list[schemas.ReviewOut])
def get_my_reviews(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    reviews = (
        db.query(models.Review)
        .join(models.Booking, models.Review.booking_id == models.Booking.id)
        .filter(
            models.Review.reviewer_id == current.id,
            models.Booking.seeker_id == current.id,
            models.Booking.status == "completed",
        )
        .order_by(models.Review.created_at.desc())
        .all()
    )
    return [_review_out(review) for review in reviews]


@router.get("/received", response_model=list[schemas.ReviewOut])
def get_received_reviews(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    reviews = (
        db.query(models.Review)
        .join(models.Booking, models.Review.booking_id == models.Booking.id)
        .join(models.Resource, models.Booking.resource_id == models.Resource.id)
        .filter(
            models.Resource.provider_id == current.id,
            models.Booking.status == "completed",
            models.Review.reviewer_id == models.Booking.seeker_id,
        )
        .order_by(models.Review.created_at.desc())
        .all()
    )
    return [_review_out(review) for review in reviews]


@router.get("/resource/{resource_id}", response_model=list[schemas.ReviewOut])
def get_resource_reviews(resource_id: int, db: Session = Depends(get_db)):
    reviews = (
        db.query(models.Review)
        .join(models.Booking, models.Review.booking_id == models.Booking.id)
        .filter(
            models.Booking.resource_id == resource_id,
            models.Booking.status == "completed",
            models.Review.reviewer_id == models.Booking.seeker_id,
        )
        .order_by(models.Review.created_at.desc())
        .all()
    )
    return [_review_out(review) for review in reviews]
