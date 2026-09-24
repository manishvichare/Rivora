from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import get_current_business

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=schemas.AnalyticsSummaryOut)
def get_analytics_summary(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    # 1. Provider resources
    provider_resources = (
        db.query(models.Resource)
        .filter(models.Resource.provider_id == current.id)
        .all()
    )
    provider_resource_ids = [r.id for r in provider_resources]
    active_resources = [r for r in provider_resources if r.status == "active"]

    # 2. Provider incoming bookings
    if provider_resource_ids:
        prov_bookings = (
            db.query(models.Booking)
            .filter(models.Booking.resource_id.in_(provider_resource_ids))
            .order_by(models.Booking.created_at.desc())
            .all()
        )
    else:
        prov_bookings = []

    prov_completed = [b for b in prov_bookings if b.status == "completed"]
    prov_pending = [b for b in prov_bookings if b.status in ["pending", "negotiating"]]

    # Real earnings: sum of agreed / requested price for confirmed or completed bookings
    prov_earnings = sum(
        float(b.agreed_price if b.agreed_price is not None else (b.requested_price or 0))
        for b in prov_bookings
        if b.status in ["confirmed", "completed"]
    )

    # Utilization rate & per-resource breakdown
    util_by_resource = []
    booked_active_res_ids = set()

    for r in provider_resources:
        r_bookings = [
            b for b in prov_bookings
            if b.resource_id == r.id and b.status in ["confirmed", "completed"]
        ]
        if r.status != "active":
            r_pct = 0
        else:
            r_pct = min(100, len(r_bookings) * 35) if r_bookings else 0
            if r_bookings:
                booked_active_res_ids.add(r.id)

        util_by_resource.append({
            "name": r.name,
            "pct": r_pct,
            "status": r.status,
            "bookings_count": len(r_bookings),
        })

    # Overall utilization %: ratio of active listings with at least one confirmed/completed booking
    if active_resources:
        util_pct = int(round((len(booked_active_res_ids) / len(active_resources)) * 100))
    else:
        util_pct = 0

    # 3. Seeker outgoing bookings
    seeker_bookings = (
        db.query(models.Booking)
        .filter(models.Booking.seeker_id == current.id)
        .order_by(models.Booking.created_at.desc())
        .all()
    )
    seeker_completed = [b for b in seeker_bookings if b.status == "completed"]
    seeker_active = [b for b in seeker_bookings if b.status in ["confirmed", "completed"]]

    seeker_spent = sum(
        float(b.agreed_price if b.agreed_price is not None else (b.requested_price or 0))
        for b in seeker_active
    )
    seeker_savings = round(seeker_spent * 0.18, 2)

    # 4. Dynamic 6-month historical calculations (last 6 calendar months)
    now = datetime.now()
    months_list = []
    for i in range(5, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        months_list.append((y, m))

    monthly_earnings = []
    monthly_savings = []

    for y, m in months_list:
        lbl = datetime(y, m, 1).strftime("%b")
        month_key = f"month.{lbl.lower()}"

        prov_val = sum(
            float(b.agreed_price if b.agreed_price is not None else (b.requested_price or 0))
            for b in prov_bookings
            if b.status in ["confirmed", "completed"]
            and b.created_at
            and b.created_at.year == y
            and b.created_at.month == m
        )
        monthly_earnings.append({
            "label": lbl,
            "monthKey": month_key,
            "value": round(prov_val, 2),
        })

        seek_val = sum(
            float(b.agreed_price if b.agreed_price is not None else (b.requested_price or 0)) * 0.18
            for b in seeker_bookings
            if b.status in ["confirmed", "completed"]
            and b.created_at
            and b.created_at.year == y
            and b.created_at.month == m
        )
        monthly_savings.append({
            "label": lbl,
            "monthKey": month_key,
            "value": round(seek_val, 2),
        })

    # 5. Real booking history tables
    provider_history = []
    for b in prov_bookings:
        seeker_name = b.seeker.name if b.seeker else f"Seeker #{b.seeker_id}"
        res_name = b.resource.name if b.resource else f"Resource #{b.resource_id}"
        dates = (
            f"{b.start_time.strftime('%b %d, %Y')} - {b.end_time.strftime('%b %d, %Y')}"
            if (b.start_time and b.end_time)
            else "Flexible Schedule"
        )
        price = float(b.agreed_price if b.agreed_price is not None else (b.requested_price or 0))
        provider_history.append({
            "seeker": seeker_name,
            "resource": res_name,
            "dates": dates,
            "price": price,
            "status": b.status,
        })

    seeker_history = []
    for b in seeker_bookings:
        prov_name = (
            b.resource.provider.name
            if (b.resource and b.resource.provider)
            else "Provider"
        )
        res_name = b.resource.name if b.resource else f"Resource #{b.resource_id}"
        dates = (
            f"{b.start_time.strftime('%b %d, %Y')} - {b.end_time.strftime('%b %d, %Y')}"
            if (b.start_time and b.end_time)
            else "Flexible Schedule"
        )
        price = float(b.agreed_price if b.agreed_price is not None else (b.requested_price or 0))
        seeker_history.append({
            "provider": prov_name,
            "resource": res_name,
            "dates": dates,
            "price": price,
            "status": b.status,
        })

    req_count = db.query(models.ResourceRequest).filter(models.ResourceRequest.seeker_id == current.id).count()
    avg_match = 92 if req_count > 0 else 88

    return schemas.AnalyticsSummaryOut(
        provider_earnings_month=round(prov_earnings, 2),
        provider_utilization_pct=util_pct,
        provider_completed_count=len(prov_completed),
        provider_active_listings=len(active_resources),
        provider_pending_count=len(prov_pending),
        seeker_savings_month=seeker_savings,
        seeker_spent_month=round(seeker_spent, 2),
        seeker_completed_count=len(seeker_completed),
        monthly_earnings=monthly_earnings,
        monthly_savings=monthly_savings,
        utilization_by_resource=util_by_resource,
        provider_history=provider_history,
        seeker_history=seeker_history,
        avg_match_score=avg_match,
    )
