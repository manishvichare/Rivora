from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_

import models


def has_conflicting_booking(
    db: Session,
    resource_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_booking_id: int | None = None,
) -> bool:
    """
    Returns True if resource_id already has a CONFIRMED booking whose time
    range overlaps [start_time, end_time).

    Two ranges overlap iff: existing.start < new.end AND existing.end > new.start
    This is called both when a seeker first requests a slot (status will become
    'pending', so no lock is needed yet) and again right before a provider
    confirms it (where it matters most).

    `with_for_update()` takes a row lock on any matching confirmed bookings so
    that if two confirm requests for overlapping slots race each other, the
    second one blocks until the first transaction commits or rolls back —
    this is what makes the check safe under concurrency, not just correct
    in the single-request case.
    """
    query = db.query(models.Booking).filter(
        and_(
            models.Booking.resource_id == resource_id,
            models.Booking.status == "confirmed",
            models.Booking.start_time < end_time,
            models.Booking.end_time > start_time,
        )
    )
    if exclude_booking_id is not None:
        query = query.filter(models.Booking.id != exclude_booking_id)

    conflicting = query.with_for_update().first()
    return conflicting is not None
