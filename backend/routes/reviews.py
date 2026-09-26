from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import get_current_business

router = APIRouter(prefix="/reviews", tags=["reviews"])


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
        raise HTTPException(status_code=400, detail="Can only review completed bookings")

    if booking.seeker_id != current.id and (booking.resource and booking.resource.provider_id != current.id):
        raise HTTPException(
            status_code=403,
            detail="Anti-Fake Review Protection: Only verified participants of this completed transaction can submit a review."
        )

    existing = db.query(models.Review).filter(models.Review.booking_id == payload.booking_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="This booking has already been reviewed")

    review = models.Review(
        booking_id=payload.booking_id,
        reviewer_id=current.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    out = schemas.ReviewOut.model_validate(review)
    out.reviewer_name = current.name
    return out


@router.get("/mine", response_model=list[schemas.ReviewOut])
def get_my_reviews(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    return (
        db.query(models.Review)
        .filter(models.Review.reviewer_id == current.id)
        .order_by(models.Review.created_at.desc())
        .all()
    )


@router.get("/resource/{resource_id}", response_model=list[schemas.ReviewOut])
def get_resource_reviews(resource_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Review)
        .join(models.Booking, models.Review.booking_id == models.Booking.id)
        .filter(models.Booking.resource_id == resource_id)
        .all()
    )
