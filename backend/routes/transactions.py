from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
import models, schemas
from auth import get_current_admin, get_current_business

router = APIRouter(prefix="/transactions", tags=["transactions"])


def format_transaction_out(txn: models.Transaction) -> schemas.TransactionOut:
    return schemas.TransactionOut(
        id=txn.id,
        transaction_code=txn.transaction_code,
        booking_id=txn.booking_id,
        seeker_id=txn.seeker_id,
        seeker_name=txn.seeker.name if txn.seeker else None,
        provider_id=txn.provider_id,
        provider_name=txn.provider.name if txn.provider else None,
        resource_id=txn.booking.resource_id if txn.booking else None,
        resource_name=txn.booking.resource.name if (txn.booking and txn.booking.resource) else None,
        amount=float(txn.amount),
        current_offer_amount=float(txn.current_offer_amount) if txn.current_offer_amount else float(txn.amount),
        accepted_offer_amount=float(txn.accepted_offer_amount) if txn.accepted_offer_amount else None,
        payment_status=txn.payment_status,
        escrow_status=txn.escrow_status,
        status=txn.status,
        created_at=txn.created_at,
        updated_at=txn.updated_at,
    )


@router.get("/mine", response_model=list[schemas.TransactionOut])
def get_my_transactions(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    # Ensure any confirmed bookings have an associated Transaction record
    confirmed_bookings = (
        db.query(models.Booking)
        .filter(
            (models.Booking.seeker_id == current.id) |
            (models.Booking.resource.has(models.Resource.provider_id == current.id))
        )
        .all()
    )
    for b in confirmed_bookings:
        existing = db.query(models.Transaction).filter(models.Transaction.booking_id == b.id).first()
        if not existing:
            price = float(b.agreed_price or b.requested_price or (b.resource.price_per_unit if b.resource else 1000.0))
            txn_status = "confirmed" if b.status == "confirmed" else ("completed" if b.status == "completed" else "negotiating")
            pay_status = "secured" if b.status in ["confirmed", "completed"] else "pending"
            escrow_stat = "held" if b.status == "confirmed" else ("released" if b.status == "completed" else "not_held")

            new_txn = models.Transaction(
                transaction_code=f"TXN-2026-{b.id:04d}",
                booking_id=b.id,
                seeker_id=b.seeker_id,
                provider_id=b.resource.provider_id if b.resource else current.id,
                amount=price,
                current_offer_amount=price,
                accepted_offer_amount=price if b.status in ["confirmed", "completed"] else None,
                payment_status=pay_status,
                escrow_status=escrow_stat,
                status=txn_status,
            )
            db.add(new_txn)
            db.flush()

            if escrow_stat == "held":
                db.add(models.EscrowRecord(
                    transaction_id=new_txn.id,
                    escrow_code=f"ESC-{b.id:04d}",
                    amount=price,
                    status="held",
                    release_condition="Resource delivery completion & seeker confirmation",
                ))

            if b.status in ["confirmed", "completed"]:
                base_amt = price
                gst_amt = round(base_amt * 0.18, 2)
                fee_amt = round(base_amt * 0.02, 2)
                db.add(models.Invoice(
                    invoice_number=f"INV-2026-{b.id:04d}",
                    transaction_id=new_txn.id,
                    booking_id=b.id,
                    seeker_id=b.seeker_id,
                    provider_id=b.resource.provider_id if b.resource else current.id,
                    base_amount=base_amt,
                    tax_gst=gst_amt,
                    platform_fee=fee_amt,
                    total_amount=round(base_amt + gst_amt + fee_amt, 2),
                    status="paid",
                ))
    db.commit()

    txns = (
        db.query(models.Transaction)
        .filter((models.Transaction.seeker_id == current.id) | (models.Transaction.provider_id == current.id))
        .order_by(models.Transaction.created_at.desc())
        .all()
    )
    return [format_transaction_out(t) for t in txns]


@router.get("/by-booking/{booking_id}", response_model=schemas.TransactionOut)
def get_transaction_by_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.booking_id == booking_id).first()
    if not txn:
        booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        price = float(booking.agreed_price or booking.requested_price or (booking.resource.price_per_unit if booking.resource else 1000.0))
        txn = models.Transaction(
            transaction_code=f"TXN-2026-{booking.id:04d}",
            booking_id=booking.id,
            seeker_id=booking.seeker_id,
            provider_id=booking.resource.provider_id if booking.resource else current.id,
            amount=price,
            current_offer_amount=price,
            accepted_offer_amount=price if booking.status == "confirmed" else None,
            payment_status="secured" if booking.status in ["confirmed", "completed"] else "pending",
            escrow_status="held" if booking.status == "confirmed" else ("released" if booking.status == "completed" else "not_held"),
            status=booking.status,
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)

    if txn.seeker_id != current.id and txn.provider_id != current.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this transaction")

    return format_transaction_out(txn)


@router.get("/{txn_id}/escrow", response_model=schemas.EscrowOut)
def get_escrow_details(
    txn_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if txn.seeker_id != current.id and txn.provider_id != current.id:
        raise HTTPException(status_code=403, detail="Not authorized to view escrow")

    escrow = db.query(models.EscrowRecord).filter(models.EscrowRecord.transaction_id == txn.id).first()
    if not escrow:
        escrow = models.EscrowRecord(
            transaction_id=txn.id,
            escrow_code=f"ESC-{txn.booking_id:04d}",
            amount=txn.amount,
            status="held" if txn.status == "confirmed" else "pending",
            release_condition="Resource delivery completion & seeker confirmation",
        )
        db.add(escrow)
        db.commit()
        db.refresh(escrow)

    return schemas.EscrowOut(
        id=escrow.id,
        transaction_id=escrow.transaction_id,
        escrow_code=escrow.escrow_code,
        amount=float(escrow.amount),
        status=escrow.status,
        held_at=escrow.held_at,
        release_condition="Your payment is secured and held according to Rivora's transaction terms until the applicable release condition is met.",
        released_at=escrow.released_at,
    )


@router.post("/{txn_id}/terms/accept", response_model=schemas.TermsAcceptanceOut)
def accept_terms(
    txn_id: int,
    payload: schemas.TermsAcceptRequest,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    acceptance = models.TermsAcceptance(
        booking_id=txn.booking_id,
        transaction_id=txn.id,
        business_id=current.id,
        terms_version=payload.terms_version or "v2.4-2026",
        service_agreement_accepted=payload.service_agreement,
        cancellation_policy_accepted=payload.cancellation_policy,
        accepted_ip="127.0.0.1",
    )
    db.add(acceptance)
    db.add(models.SecurityLog(
        business_id=current.id,
        event_type="terms_accepted",
        description=f"Business {current.name} accepted Terms & Conditions ({acceptance.terms_version}) for Transaction {txn.transaction_code}."
    ))
    db.commit()
    db.refresh(acceptance)
    return schemas.TermsAcceptanceOut(
        id=acceptance.id,
        booking_id=acceptance.booking_id,
        transaction_id=acceptance.transaction_id,
        business_id=acceptance.business_id,
        terms_version=acceptance.terms_version,
        accepted_at=acceptance.accepted_at,
    )


@router.get("/{txn_id}/agreement")
def get_service_agreement(
    txn_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    b = txn.booking
    res = b.resource if b else None
    seeker = txn.seeker
    provider = txn.provider

    return {
        "transaction_code": txn.transaction_code,
        "agreement_version": "SA-2026-B2B",
        "date_issued": str(txn.created_at.date() if txn.created_at else "2026-09-22"),
        "parties": {
            "provider": {
                "id": provider.id if provider else None,
                "name": provider.name if provider else "Provider Business",
                "type": provider.business_type if provider else "Commercial Host",
                "verified": bool(provider.verified) if provider else False,
            },
            "seeker": {
                "id": seeker.id if seeker else None,
                "name": seeker.name if seeker else "Seeker Business",
                "type": seeker.business_type if seeker else "Commercial Seeker",
                "verified": bool(seeker.verified) if seeker else False,
            }
        },
        "resource": {
            "name": res.name if res else "Resource Slot",
            "type": res.type if res else "Space",
            "location": res.location if res else "Mumbai, India",
            "start_time": str(b.start_time) if b else None,
            "end_time": str(b.end_time) if b else None,
        },
        "commercial_terms": {
            "agreed_amount": float(txn.amount),
            "payment_escrow": "Funds held securely in Rivora Escrow until delivery sign-off",
            "cancellation_policy": "Full refund up to 48 hours before slot start time; 50% refund thereafter.",
            "dispute_resolution": "Rivora Trust & Safety binding arbitration for commercial hospitality contracts.",
        }
    }


@router.get("/{txn_id}/invoice", response_model=schemas.InvoiceOut)
def get_invoice(
    txn_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    inv = db.query(models.Invoice).filter(models.Invoice.transaction_id == txn.id).first()
    if not inv:
        base_amt = float(txn.amount)
        gst = round(base_amt * 0.18, 2)
        fee = round(base_amt * 0.02, 2)
        inv = models.Invoice(
            invoice_number=f"INV-2026-{txn.booking_id:04d}",
            transaction_id=txn.id,
            booking_id=txn.booking_id,
            seeker_id=txn.seeker_id,
            provider_id=txn.provider_id,
            base_amount=base_amt,
            tax_gst=gst,
            platform_fee=fee,
            total_amount=round(base_amt + gst + fee, 2),
            status="paid" if txn.payment_status in ["secured", "released"] else "issued",
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)

    b = txn.booking
    res = b.resource if b else None
    return schemas.InvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        transaction_id=inv.transaction_id,
        booking_id=inv.booking_id,
        seeker_name=txn.seeker.name if txn.seeker else "Seeker Client",
        provider_name=txn.provider.name if txn.provider else "Provider Host",
        resource_name=res.name if res else "Resource Slot",
        base_amount=float(inv.base_amount),
        tax_gst=float(inv.tax_gst),
        platform_fee=float(inv.platform_fee),
        total_amount=float(inv.total_amount),
        payment_method=inv.payment_method,
        status=inv.status,
        issued_at=inv.issued_at,
    )


@router.post("/{txn_id}/refund", response_model=schemas.RefundRequestOut)
def request_refund(
    txn_id: int,
    payload: schemas.RefundRequestCreate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if txn.seeker_id != current.id:
        raise HTTPException(status_code=403, detail="Only the seeker can submit a refund request for this transaction")

    refund = models.RefundRequest(
        transaction_id=txn.id,
        booking_id=txn.booking_id,
        requested_by_id=current.id,
        amount=payload.amount or txn.amount,
        reason=payload.reason.strip(),
        status="requested",
    )
    db.add(refund)
    txn.status = "disputed"
    txn.escrow_status = "refund_held"

    # Notification to provider and admin
    db.add(models.Notification(
        business_id=txn.provider_id,
        category="payments",
        title="Refund Requested",
        message=f"{current.name} requested a refund for Transaction {txn.transaction_code}. Reason: {payload.reason}",
        link_url="provider.html#transactions",
    ))

    db.commit()
    db.refresh(refund)
    return schemas.RefundRequestOut(
        id=refund.id,
        transaction_id=refund.transaction_id,
        booking_id=refund.booking_id,
        requested_by_id=refund.requested_by_id,
        requested_by_name=current.name,
        amount=float(refund.amount),
        reason=refund.reason,
        status=refund.status,
        rejection_reason=refund.rejection_reason,
        created_at=refund.created_at,
        updated_at=refund.updated_at,
    )


@router.post("/{txn_id}/escrow/release", response_model=schemas.EscrowOut)
def release_escrow_funds(
    txn_id: int,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Payment Safety Protection: Check verified bank details
    bank_doc = db.query(models.ProviderDocument).filter(
        models.ProviderDocument.business_id == txn.provider_id,
        models.ProviderDocument.doc_type == "bank_account",
        models.ProviderDocument.status == "verified"
    ).first()
    if not bank_doc:
        raise HTTPException(
            status_code=400,
            detail="Payment Safety Protection: Provider bank account details must be verified before escrow payouts can be released."
        )

    escrow = db.query(models.EscrowRecord).filter(models.EscrowRecord.transaction_id == txn.id).first()
    if not escrow:
        escrow = models.EscrowRecord(
            transaction_id=txn.id,
            escrow_code=f"ESC-{txn.booking_id:04d}",
            amount=txn.amount,
            status="held",
            release_condition="Resource delivery completion & seeker confirmation",
        )
        db.add(escrow)

    escrow.status = "released"
    escrow.released_at = func.now()
    txn.escrow_status = "released"
    txn.status = "completed"

    db.add(models.Notification(
        business_id=txn.provider_id,
        category="payments",
        title="Escrow Payout Released",
        message=f"₹{float(txn.amount):,.2f} has been released from escrow directly to your verified bank account ({bank_doc.doc_number_masked}).",
        link_url="transactions.html",
    ))

    db.commit()
    db.refresh(escrow)

    return schemas.EscrowOut(
        id=escrow.id,
        transaction_id=escrow.transaction_id,
        escrow_code=escrow.escrow_code,
        amount=float(escrow.amount),
        status=escrow.status,
        held_at=escrow.held_at,
        release_condition=f"Released to verified bank account {bank_doc.doc_number_masked}",
        released_at=escrow.released_at,
    )


@router.post("/{txn_id}/pay", response_model=schemas.PaymentProcessOut)
def process_transaction_payment(
    txn_id: int,
    payload: schemas.PaymentProcessIn,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if txn.seeker_id != current.id:
        raise HTTPException(status_code=403, detail="Only the seeker can pay for this transaction")

    import uuid
    ref_code = f"PAY-{uuid.uuid4().hex[:8].upper()}"

    total_amount = float(txn.amount)
    is_advance = payload.payment_type == "advance"
    pct = payload.advance_percentage or 25
    paid_amount = round(total_amount * (pct / 100.0), 2) if is_advance else total_amount

    txn.payment_status = "secured"
    txn.escrow_status = "held"
    txn.status = "confirmed"

    # Update associated booking
    booking = txn.booking
    if booking:
        booking.status = "confirmed"

    # Update or create Escrow record
    escrow = db.query(models.EscrowRecord).filter(models.EscrowRecord.transaction_id == txn.id).first()
    if not escrow:
        escrow = models.EscrowRecord(
            transaction_id=txn.id,
            escrow_code=f"ESC-{txn.booking_id:04d}",
            amount=total_amount,
            status="held",
            release_condition="Resource delivery completion & seeker confirmation",
        )
        db.add(escrow)
    else:
        escrow.status = "held"
        escrow.amount = total_amount

    # Tax Invoice with GST breakdown (18% GST: 9% CGST + 9% SGST)
    inv = db.query(models.Invoice).filter(models.Invoice.transaction_id == txn.id).first()
    base_amt = round(paid_amount / 1.18, 2)
    tax_amt = round(paid_amount - base_amt, 2)
    fee_amt = round(paid_amount * 0.02, 2)

    method_label = payload.payment_method.upper()
    if payload.upi_id:
        method_label = f"UPI ({payload.upi_id})"
    elif payload.card_last4:
        method_label = f"Card •••• {payload.card_last4} ({payload.card_network or 'Visa/MC'})"
    elif payload.bank_name:
        method_label = f"Net Banking ({payload.bank_name})"
    elif payload.wallet_name:
        method_label = f"Wallet ({payload.wallet_name})"

    if not inv:
        inv = models.Invoice(
            invoice_number=f"INV-2026-{txn.booking_id:04d}",
            transaction_id=txn.id,
            booking_id=txn.booking_id,
            seeker_id=txn.seeker_id,
            provider_id=txn.provider_id,
            base_amount=base_amt,
            tax_gst=tax_amt,
            platform_fee=fee_amt,
            total_amount=paid_amount,
            payment_method=method_label,
            status="paid",
        )
        db.add(inv)
    else:
        inv.payment_method = method_label
        inv.status = "paid"
        inv.total_amount = paid_amount

    # Security audit log
    db.add(models.SecurityLog(
        business_id=current.id,
        event_type="payment_secured",
        description=f"Payment of ₹{paid_amount:,.2f} ({payload.payment_type}) secured via {method_label}. Escrow held ref {ref_code}."
    ))

    # Notifications
    db.add(models.Notification(
        business_id=txn.provider_id,
        category="payments",
        title="Escrow Payment Secured",
        message=f"{current.name} paid ₹{paid_amount:,.2f} for booking {txn.transaction_code}. Funds are secured in Escrow.",
        link_url="transactions.html",
    ))
    db.add(models.Notification(
        business_id=current.id,
        category="payments",
        title="Payment Successful (Escrow Protected)",
        message=f"₹{paid_amount:,.2f} secured in Rivora Escrow for {booking.resource.name if (booking and booking.resource) else 'your booking'}.",
        link_url="transactions.html",
    ))

    db.commit()
    db.refresh(txn)

    return schemas.PaymentProcessOut(
        success=True,
        transaction_code=txn.transaction_code,
        booking_id=txn.booking_id,
        amount_paid=paid_amount,
        total_amount=total_amount,
        payment_type=payload.payment_type or "full",
        payment_method=method_label,
        escrow_status="held",
        payment_reference=ref_code,
        invoice_number=inv.invoice_number if inv else None,
        message=f"Payment of ₹{paid_amount:,.2f} successfully processed via {method_label} and held in Escrow protection."
    )


@router.post("/{txn_id}/refund/review")
def review_refund_request(
    txn_id: int,
    payload: schemas.AdminRefundReview,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_admin),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    refund = db.query(models.RefundRequest).filter(models.RefundRequest.transaction_id == txn.id).order_by(models.RefundRequest.created_at.desc()).first()
    if not refund:
        raise HTTPException(status_code=404, detail="No active refund request for this transaction")

    if payload.status == "approved":
        refund.status = "approved"
        txn.status = "refunded"
        txn.escrow_status = "refunded"
        if txn.booking:
            txn.booking.status = "cancelled"

        db.add(models.Notification(
            business_id=txn.seeker_id,
            category="payments",
            title="Refund Approved",
            message=f"Your refund request for ₹{float(refund.amount):,.2f} on Transaction {txn.transaction_code} has been approved and credited back to source.",
            link_url="transactions.html",
        ))
    else:
        refund.status = "rejected"
        refund.rejection_reason = payload.rejection_reason or "Refund request did not meet cancellation policy terms."
        txn.status = "confirmed"
        txn.escrow_status = "held"

        db.add(models.Notification(
            business_id=txn.seeker_id,
            category="payments",
            title="Refund Denied",
            message=f"Your refund request for Transaction {txn.transaction_code} was declined: {refund.rejection_reason}",
            link_url="transactions.html",
        ))

    db.commit()
    return {"status": refund.status, "transaction_id": txn.id, "refund_id": refund.id}
