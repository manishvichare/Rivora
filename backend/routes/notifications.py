from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import get_current_business

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[schemas.NotificationOut])
def get_notifications(
    category: Optional[str] = Query(None, description="Category filter"),
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    query = db.query(models.Notification).filter(models.Notification.business_id == current.id)
    if category and category.lower() != "all":
        query = query.filter(models.Notification.category == category.lower())

    notifs = query.order_by(models.Notification.created_at.desc()).limit(50).all()

    # If empty, add a default welcoming notification
    if not notifs and (not category or category.lower() == "all"):
        welcome = models.Notification(
            business_id=current.id,
            category="system",
            title="Welcome to Rivora Marketplace",
            message="Your account is connected to our secure hospitality exchange. Track bookings, escrow payments, and verifications here.",
            link_url=None,
            read=False
        )
        db.add(welcome)
        db.commit()
        db.refresh(welcome)
        notifs = [welcome]

    return notifs


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    count = (
        db.query(models.Notification)
        .filter(models.Notification.business_id == current.id, models.Notification.read == False)
        .count()
    )
    return {"unread_count": count}


@router.patch("/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    notif = db.query(models.Notification).filter(models.Notification.id == notif_id, models.Notification.business_id == current.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    db.commit()
    return {"status": "success", "id": notif_id, "read": True}


@router.post("/mark-all-read")
def mark_all_read(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    (
        db.query(models.Notification)
        .filter(models.Notification.business_id == current.id, models.Notification.read == False)
        .update({models.Notification.read: True}, synchronize_session=False)
    )
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}
