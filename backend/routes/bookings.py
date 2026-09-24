from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
import models, schemas
from auth import get_current_business
from services.conflict_check import has_conflicting_booking

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=schemas.BookingOut, status_code=201)
def create_booking(
    payload: schemas.BookingCreate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    resource = db.query(models.Resource).filter(models.Resource.id == payload.resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    # A brand new request starts as 'pending', so it can't yet conflict with
    # another *confirmed* booking by definition of has_conflicting_booking —
    # but we still check here to give the seeker instant feedback instead of
    # letting them wait for a provider to reject an already-impossible slot.
    if has_conflicting_booking(db, payload.resource_id, payload.start_time, payload.end_time):
        raise HTTPException(status_code=409, detail="This resource is already booked for that time range")

    booking = models.Booking(
        resource_id=payload.resource_id,
        seeker_id=current.id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        requested_price=payload.requested_price,
        notes=payload.notes,
        status="pending",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return format_booking_out(booking, current)


def format_booking_out(booking: models.Booking, current: models.Business) -> schemas.BookingOut:
    is_provider = bool(booking.resource and booking.resource.provider_id == current.id)
    is_seeker = bool(booking.seeker_id == current.id)
    direction = "received" if is_provider else "sent"
    provider_name = booking.resource.provider.name if (booking.resource and booking.resource.provider) else None
    seeker_name = booking.seeker.name if booking.seeker else None
    counterpart_name = seeker_name if is_provider else provider_name

    # Resource base pricing
    current_price = float(booking.resource.price_per_unit) if (booking.resource and booking.resource.price_per_unit) else (float(booking.requested_price) if booking.requested_price else 0.0)
    price_unit = booking.resource.price_unit if booking.resource else "per_day"

    # Offers processing
    offers_out = []
    chronological_offers = []
    seeker_offer = float(booking.requested_price) if booking.requested_price is not None else None
    provider_counter_offer = None

    if booking.offers:
        # booking.offers is sorted desc by created_at in model
        chronological_offers = sorted(booking.offers, key=lambda o: o.created_at if o.created_at else o.id)
        for off in booking.offers:
            offers_out.append(schemas.OfferOut(
                id=off.id,
                booking_id=off.booking_id,
                sender_id=off.sender_id,
                receiver_id=off.receiver_id,
                amount=float(off.amount),
                status=off.status,
                notes=off.notes,
                created_at=off.created_at,
                sender_name=off.sender.name if off.sender else None,
                receiver_name=off.receiver.name if off.receiver else None,
            ))

        # Check latest offers from each party
        for off in chronological_offers:
            if off.sender_id == booking.seeker_id:
                seeker_offer = float(off.amount)
            elif booking.resource and off.sender_id == booking.resource.provider_id:
                provider_counter_offer = float(off.amount)

    # Active (most recent) offer
    if booking.offers:
        latest_off = booking.offers[0]
        active_offer = float(latest_off.amount)
        active_offer_by = "provider" if (booking.resource and latest_off.sender_id == booking.resource.provider_id) else "seeker"
    elif booking.requested_price is not None:
        active_offer = float(booking.requested_price)
        active_offer_by = "seeker"
    else:
        active_offer = None
        active_offer_by = None

    # Negotiation history timeline
    negotiation_history = []
    negotiation_history.append({
        "label": "Original Price",
        "amount": current_price,
        "by": "Listing",
        "is_active": False,
        "created_at": str(booking.created_at) if booking.created_at else None,
    })

    if booking.requested_price is not None and (not chronological_offers or chronological_offers[0].amount != booking.requested_price):
        negotiation_history.append({
            "label": "Seeker Initial Offer",
            "amount": float(booking.requested_price),
            "by": "Seeker",
            "is_active": False,
            "created_at": str(booking.created_at) if booking.created_at else None,
        })

    for off in chronological_offers:
        is_prov_offer = bool(booking.resource and off.sender_id == booking.resource.provider_id)
        label = "Provider Counter Offer" if is_prov_offer else "Seeker Counter Offer"
        negotiation_history.append({
            "label": label,
            "amount": float(off.amount),
            "by": "Provider" if is_prov_offer else "Seeker",
            "is_active": False,
            "status": off.status,
            "created_at": str(off.created_at) if off.created_at else None,
        })

    # Negotiation status text
    if booking.status == "confirmed":
        negotiation_status = f"Final Offer Confirmed (₹{float(booking.agreed_price or active_offer or current_price):,.2f})"
        if negotiation_history:
            negotiation_history[-1]["is_active"] = True
    elif booking.status == "completed":
        negotiation_status = "Transaction Completed"
    elif booking.status in ["declined", "rejected"]:
        negotiation_status = "Negotiation Declined"
    elif booking.status in ["cancelled", "canceled"]:
        negotiation_status = "Negotiation Cancelled"
    elif booking.status == "pending":
        negotiation_status = "Pending Provider Confirmation" if active_offer is not None else "Pending Review"
        if negotiation_history:
            negotiation_history[-1]["is_active"] = True
    elif booking.status == "negotiating":
        if active_offer_by == "provider":
            negotiation_status = "Counter Offer Pending"
        else:
            negotiation_status = "Seeker Offer Pending"
        if negotiation_history:
            negotiation_history[-1]["is_active"] = True
    else:
        negotiation_status = booking.status.capitalize()

    # Permissions
    # CRITICAL: Seeker can NEVER confirm. Only provider can confirm open bookings with an offer.
    can_confirm = bool(
        is_provider and
        booking.status in ["pending", "negotiating"] and
        (active_offer is not None or booking.requested_price is not None or booking.agreed_price is not None)
    )
    can_counter = bool(booking.status in ["pending", "negotiating"])

    # Transaction link
    txn_code = None
    if hasattr(booking, "id"):
        # Look for existing transaction if loaded
        pass

    return schemas.BookingOut(
        id=booking.id,
        resource_id=booking.resource_id,
        resource_name=booking.resource.name if booking.resource else f"Resource #{booking.resource_id}",
        resource_type=booking.resource.type if booking.resource else "Space",
        seeker_id=booking.seeker_id,
        seeker_name=seeker_name,
        provider_id=booking.resource.provider_id if booking.resource else None,
        provider_name=provider_name,
        counterpart_name=counterpart_name or "Partner",
        direction=direction,
        start_time=booking.start_time,
        end_time=booking.end_time,
        status=booking.status,
        requested_price=float(booking.requested_price) if booking.requested_price is not None else None,
        agreed_price=float(booking.agreed_price) if booking.agreed_price is not None else None,
        notes=booking.notes,
        created_at=booking.created_at,
        latest_offer_amount=active_offer,
        offers=offers_out,
        current_price=current_price,
        price_unit=price_unit,
        seeker_offer=seeker_offer,
        provider_counter_offer=provider_counter_offer,
        active_offer=active_offer,
        active_offer_by=active_offer_by,
        negotiation_status=negotiation_status,
        can_confirm=can_confirm,
        can_counter=can_counter,
        is_provider=is_provider,
        negotiation_history=negotiation_history,
        transaction_code=f"TXN-2026-{booking.id:04d}",
    )


def execute_booking_confirmation(booking: models.Booking, db: Session, current: models.Business, agreed_price_override: float = None):
    """Encapsulates confirmation logic with strict role check, conflict check, escrow, and invoice creation."""
    resource = db.query(models.Resource).filter(models.Resource.id == booking.resource_id).first()
    is_provider = resource and resource.provider_id == current.id
    if not is_provider:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only the resource provider is authorized to confirm this booking or accept an offer."
        )

    if booking.status in ["confirmed", "completed", "declined", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm a booking that is already {booking.status}."
        )

    if has_conflicting_booking(
        db, booking.resource_id, booking.start_time, booking.end_time,
        exclude_booking_id=booking.id
    ):
        db.rollback()
        raise HTTPException(status_code=409, detail="A conflicting booking was just confirmed for this slot")

    # Determine final agreed price
    final_price = agreed_price_override
    if final_price is None:
        if booking.offers:
            final_price = float(booking.offers[0].amount)
        elif booking.agreed_price is not None:
            final_price = float(booking.agreed_price)
        elif booking.requested_price is not None:
            final_price = float(booking.requested_price)
        elif resource:
            final_price = float(resource.price_per_unit)
        else:
            final_price = 0.0

    booking.status = "confirmed"
    booking.agreed_price = final_price

    # Accept latest pending offer
    for off in booking.offers:
        if off.status == "pending":
            off.status = "accepted"

    # Add audit log message
    sys_text = f"Booking confirmed at ₹{float(final_price):,.2f} by Provider {current.name}."
    status_msg = models.Message(
        booking_id=booking.id,
        sender_id=current.id,
        message_text=sys_text,
        message_type="system",
    )
    db.add(status_msg)

    # Manage or create Transaction and Escrow
    txn = db.query(models.Transaction).filter(models.Transaction.booking_id == booking.id).first()
    txn_code = f"TXN-2026-{booking.id:04d}"
    if not txn:
        txn = models.Transaction(
            transaction_code=txn_code,
            booking_id=booking.id,
            seeker_id=booking.seeker_id,
            provider_id=resource.provider_id,
            amount=final_price,
            current_offer_amount=final_price,
            accepted_offer_amount=final_price,
            payment_status="secured",
            escrow_status="held",
            status="confirmed",
        )
        db.add(txn)
        db.flush()

        escrow = models.EscrowRecord(
            transaction_id=txn.id,
            escrow_code=f"ESC-{booking.id:04d}",
            amount=final_price,
            status="held",
            release_condition="Resource delivery completion & seeker confirmation",
        )
        db.add(escrow)
    else:
        txn.status = "confirmed"
        txn.payment_status = "secured"
        txn.escrow_status = "held"
        txn.amount = final_price
        txn.accepted_offer_amount = final_price

    # Create Invoice if not existing
    inv = db.query(models.Invoice).filter(models.Invoice.booking_id == booking.id).first()
    if not inv:
        base_amt = float(final_price)
        gst_amt = round(base_amt * 0.18, 2)
        fee_amt = round(base_amt * 0.02, 2)
        total_amt = round(base_amt + gst_amt + fee_amt, 2)
        inv = models.Invoice(
            invoice_number=f"INV-2026-{booking.id:04d}",
            transaction_id=txn.id,
            booking_id=booking.id,
            seeker_id=booking.seeker_id,
            provider_id=resource.provider_id,
            base_amount=base_amt,
            tax_gst=gst_amt,
            platform_fee=fee_amt,
            total_amount=total_amt,
            payment_method="Escrow Secured / UPI / Bank Transfer",
            status="paid",
        )
        db.add(inv)

    # Dispatch notification to Seeker
    notif = models.Notification(
        business_id=booking.seeker_id,
        category="transactions",
        title="Booking Confirmed",
        message=f"Your booking for '{resource.name}' has been confirmed by {current.name} at ₹{float(final_price):,.2f}.",
        link_url=f"requests.html?id={booking.id}",
    )
    db.add(notif)


@router.post("/{booking_id}/confirm", response_model=schemas.BookingOut)
def confirm_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    """Dedicated endpoint for Provider confirmation."""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    execute_booking_confirmation(booking, db, current)
    db.commit()
    db.refresh(booking)
    return format_booking_out(booking, current)


@router.patch("/{booking_id}", response_model=schemas.BookingOut)
def update_booking_status(
    booking_id: int,
    payload: schemas.BookingStatusUpdate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    resource = db.query(models.Resource).filter(models.Resource.id == booking.resource_id).first()
    is_provider = resource and resource.provider_id == current.id
    is_seeker = booking.seeker_id == current.id
    if not (is_provider or is_seeker):
        raise HTTPException(status_code=403, detail="Not authorized to modify this booking")

    # Normalize incoming status
    target_status = payload.status.lower()
    if target_status in ["accepted", "confirmed"]:
        norm_status = "confirmed"
    elif target_status in ["declined", "rejected"]:
        norm_status = "declined"
    elif target_status in ["negotiating", "counter"]:
        norm_status = "negotiating"
    elif target_status in ["completed"]:
        norm_status = "completed"
    elif target_status in ["cancelled", "canceled"]:
        norm_status = "cancelled"
    else:
        norm_status = target_status

    if norm_status == "confirmed":
        # CRITICAL BACKEND AUTHORIZATION: Strictly reject if Seeker calls confirm
        execute_booking_confirmation(booking, db, current, agreed_price_override=payload.agreed_price)
    elif norm_status == "declined":
        # Provider rejecting or Seeker withdrawing
        for off in booking.offers:
            if off.status == "pending":
                off.status = "declined"
        booking.status = "declined"
        db.add(models.Message(
            booking_id=booking.id,
            sender_id=current.id,
            message_text=f"Request declined by {current.name}.",
            message_type="system",
        ))
    elif norm_status == "completed":
        if not is_provider:
            raise HTTPException(status_code=403, detail="Only the provider can mark a booking as completed.")
        booking.status = "completed"
        # Release escrow
        txn = db.query(models.Transaction).filter(models.Transaction.booking_id == booking.id).first()
        if txn:
            txn.status = "completed"
            txn.escrow_status = "released"
            txn.payment_status = "released"
            if txn.escrow_record:
                txn.escrow_record.status = "released"
                txn.escrow_record.released_at = func.now()

        db.add(models.Message(
            booking_id=booking.id,
            sender_id=current.id,
            message_text="Resource delivery completed. Escrow funds released to provider.",
            message_type="system",
        ))
    else:
        booking.status = norm_status

    if payload.agreed_price is not None and norm_status != "confirmed":
        booking.agreed_price = payload.agreed_price
    if payload.notes is not None:
        booking.notes = payload.notes

    db.commit()
    db.refresh(booking)
    return format_booking_out(booking, current)


@router.post("/{booking_id}/counter", response_model=schemas.BookingOut)
def create_counter_offer(
    booking_id: int,
    payload: schemas.OfferCreate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    resource = db.query(models.Resource).filter(models.Resource.id == booking.resource_id).first()
    is_provider = resource and resource.provider_id == current.id
    is_seeker = booking.seeker_id == current.id
    if not (is_provider or is_seeker):
        raise HTTPException(status_code=403, detail="Not authorized to counter this booking")

    if booking.status in ["confirmed", "completed", "declined", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Negotiation is closed. Cannot make an offer on a {booking.status} booking."
        )

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Offer amount must be greater than zero.")

    receiver_id = booking.seeker_id if is_provider else resource.provider_id

    # Supersede older pending offers
    for off in booking.offers:
        if off.status == "pending":
            off.status = "superseded"

    offer = models.Offer(
        booking_id=booking.id,
        sender_id=current.id,
        receiver_id=receiver_id,
        amount=payload.amount,
        notes=payload.notes,
        status="pending",
    )
    db.add(offer)

    booking.status = "negotiating"
    booking.agreed_price = payload.amount
    if payload.notes:
        booking.notes = payload.notes

    # Add message log for negotiation timeline
    sender_role = "Provider" if is_provider else "Seeker"
    msg_note = f" (Note: {payload.notes})" if payload.notes else ""
    offer_msg = models.Message(
        booking_id=booking.id,
        sender_id=current.id,
        message_text=f"{sender_role} proposed counter-offer: ₹{float(payload.amount):,.2f}{msg_note}",
        message_type="offer",
    )
    db.add(offer_msg)

    # Dispatch notification to counterpart
    counterpart_id = receiver_id
    db.add(models.Notification(
        business_id=counterpart_id,
        category="transactions",
        title="New Counter-Offer Received",
        message=f"{current.name} sent a counter-offer of ₹{float(payload.amount):,.2f} for '{resource.name}'.",
        link_url=f"requests.html?id={booking.id}",
    ))

    db.commit()
    db.refresh(booking)
    return format_booking_out(booking, current)


@router.get("/mine", response_model=list[schemas.BookingOut])
def my_bookings(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    """Returns bookings where the current business is either the seeker,
    or the provider of the booked resource."""
    as_seeker = db.query(models.Booking).filter(models.Booking.seeker_id == current.id).all()
    provider_resource_ids = [
        r.id for r in db.query(models.Resource.id).filter(models.Resource.provider_id == current.id)
    ]
    as_provider = (
        db.query(models.Booking).filter(models.Booking.resource_id.in_(provider_resource_ids)).all()
        if provider_resource_ids else []
    )
    all_bookings = {b.id: b for b in as_seeker + as_provider}.values()
    sorted_bookings = sorted(
        all_bookings,
        key=lambda x: x.created_at if x.created_at else x.start_time,
        reverse=True
    )
    return [format_booking_out(b, current) for b in sorted_bookings]


@router.get("/{booking_id}", response_model=schemas.BookingOut)
def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    resource = db.query(models.Resource).filter(models.Resource.id == booking.resource_id).first()
    is_provider = resource and resource.provider_id == current.id
    is_seeker = booking.seeker_id == current.id
    if not (is_provider or is_seeker):
        raise HTTPException(status_code=403, detail="Not authorized to view this booking")

    return format_booking_out(booking, current)


@router.get("/{booking_id}/messages", response_model=list[schemas.MessageOut])
def get_booking_messages(
    booking_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    resource = db.query(models.Resource).filter(models.Resource.id == booking.resource_id).first()
    is_provider = resource and resource.provider_id == current.id
    is_seeker = booking.seeker_id == current.id
    if not (is_provider or is_seeker):
        raise HTTPException(status_code=403, detail="Not authorized to view messages for this booking")

    messages = (
        db.query(models.Message)
        .filter(models.Message.booking_id == booking_id)
        .order_by(models.Message.created_at.asc())
        .all()
    )

    result = []
    for m in messages:
        out = schemas.MessageOut.model_validate(m)
        out.sender_name = m.sender.name if m.sender else "Partner"
        out.is_me = (m.sender_id == current.id)
        result.append(out)

    return result


@router.post("/{booking_id}/messages", response_model=schemas.MessageOut, status_code=201)
def send_booking_message(
    booking_id: int,
    payload: schemas.MessageCreate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    resource = db.query(models.Resource).filter(models.Resource.id == booking.resource_id).first()
    is_provider = resource and resource.provider_id == current.id
    is_seeker = booking.seeker_id == current.id
    if not (is_provider or is_seeker):
        raise HTTPException(status_code=403, detail="Not authorized to message on this booking")

    text = payload.message_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    message = models.Message(
        booking_id=booking_id,
        sender_id=current.id,
        message_text=text,
        message_type=payload.message_type or "chat",
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    out = schemas.MessageOut.model_validate(message)
    out.sender_name = current.name
    out.is_me = True
    return out

