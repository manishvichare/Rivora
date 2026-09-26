from datetime import datetime
import csv
import io
import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
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


SHEET_HEADERS = [
    "Date", "Booking ID", "Client", "Resource", "Category",
    "Income", "Expense", "GST/Tax", "Payment Method",
]


class SheetSyncRequest(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


def _get_sheets_client():
    try:
        import gspread
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Google Sheets support is not installed on this server.") from exc

    credentials_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if credentials_json:
        try:
            service_account_info = json.loads(credentials_json)
            return gspread.service_account_from_dict(service_account_info)
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=503, detail="Google service-account JSON is invalid.") from exc

    configured_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")
    credentials_path = Path(configured_path)
    if not credentials_path.is_absolute():
        credentials_path = Path(__file__).resolve().parents[1] / credentials_path
    if not credentials_path.is_file():
        raise HTTPException(
            status_code=503,
            detail="Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or provide the service-account file.",
        )
    return gspread.service_account(filename=str(credentials_path))


@router.post("/sync-sheet")
def sync_month_to_google_sheet(
    payload: SheetSyncRequest,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
    if not sheet_id:
        raise HTTPException(status_code=503, detail="Google Sheets is not configured. Set GOOGLE_SHEET_ID on the backend.")

    month_start = datetime.strptime(payload.month, "%Y-%m")
    month_end = datetime(month_start.year + (month_start.month == 12), month_start.month % 12 + 1, 1)
    invoices = (
        db.query(models.Invoice)
        .filter(
            ((models.Invoice.provider_id == current.id) | (models.Invoice.seeker_id == current.id)),
            models.Invoice.issued_at >= month_start,
            models.Invoice.issued_at < month_end,
            models.Invoice.status.in_(["paid", "issued"]),
        )
        .order_by(models.Invoice.issued_at, models.Invoice.booking_id)
        .all()
    )

    rows = []
    for invoice in invoices:
        is_provider = invoice.provider_id == current.id
        booking = invoice.booking
        resource = booking.resource if booking else None
        client = invoice.seeker.name if is_provider and invoice.seeker else (
            invoice.provider.name if not is_provider and invoice.provider else "Business"
        )
        rows.append([
            (invoice.issued_at or (booking.start_time if booking else month_start)).strftime("%Y-%m-%d"),
            invoice.booking_id,
            client,
            resource.name if resource else "Resource",
            "Income" if is_provider else "Expense",
            float(invoice.base_amount or 0) if is_provider else 0.0,
            float(invoice.total_amount or 0) if not is_provider else 0.0,
            float(invoice.tax_gst or 0),
            invoice.payment_method or "",
        ])

    worksheet_name = os.getenv("GOOGLE_SHEET_WORKSHEET", "Sheet1").strip() or "Sheet1"
    try:
        client = _get_sheets_client()
        spreadsheet = client.open_by_key(sheet_id)
        worksheet = spreadsheet.worksheet(worksheet_name)
        existing_values = worksheet.get_all_values()

        if not existing_values or not any(cell.strip() for cell in existing_values[0]):
            worksheet.append_row(SHEET_HEADERS, value_input_option="RAW")
            existing_values = [SHEET_HEADERS]
        elif existing_values[0][:len(SHEET_HEADERS)] != SHEET_HEADERS:
            raise HTTPException(
                status_code=409,
                detail="The first row of the selected sheet must match Rivora's financial export headers.",
            )

        existing_keys = {
            (row[0], row[1], row[4])
            for row in existing_values[1:]
            if len(row) > 4
        }
        new_rows = [
            row for row in rows
            if (str(row[0]), str(row[1]), str(row[4])) not in existing_keys
        ]
        if new_rows:
            worksheet.append_rows(new_rows, value_input_option="RAW")

        sheet_url = spreadsheet.url
        return {
            "message": f"Synced {len(new_rows)} new row(s); skipped {len(rows) - len(new_rows)} already-synced row(s).",
            "appended": len(new_rows),
            "skipped": len(rows) - len(new_rows),
            "sheet_url": sheet_url,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logging.getLogger(__name__).exception("Google Sheets sync failed")
        raise HTTPException(
            status_code=502,
            detail="Could not reach the Google Sheet. Check the service-account key, sheet sharing, worksheet name, and backend logs.",
        ) from exc


@router.get("/export-csv")
def export_month_as_csv(
    month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    try:
        month_start = datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=422, detail="month must use YYYY-MM format")
    if month_start.strftime("%Y-%m") != month:
        raise HTTPException(status_code=422, detail="month must use YYYY-MM format")
    month_end = datetime(month_start.year + (month_start.month == 12), month_start.month % 12 + 1, 1)
    invoices = (
        db.query(models.Invoice)
        .filter(
            ((models.Invoice.provider_id == current.id) | (models.Invoice.seeker_id == current.id)),
            models.Invoice.issued_at >= month_start,
            models.Invoice.issued_at < month_end,
            models.Invoice.status.in_(["paid", "issued"]),
        )
        .order_by(models.Invoice.issued_at, models.Invoice.booking_id)
        .all()
    )
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(SHEET_HEADERS)
    for invoice in invoices:
        is_provider = invoice.provider_id == current.id
        booking = invoice.booking
        resource = booking.resource if booking else None
        client = invoice.seeker.name if is_provider and invoice.seeker else (
            invoice.provider.name if not is_provider and invoice.provider else "Business"
        )
        def safe_text(value):
            return "'" + value if value.startswith(("=", "+", "-", "@")) else value
        writer.writerow([
            (invoice.issued_at or (booking.start_time if booking else month_start)).strftime("%Y-%m-%d"),
            invoice.booking_id, safe_text(client), safe_text(resource.name if resource else "Resource"),
            "Income" if is_provider else "Expense",
            float(invoice.base_amount or 0) if is_provider else 0.0,
            float(invoice.total_amount or 0) if not is_provider else 0.0,
            float(invoice.tax_gst or 0), safe_text(invoice.payment_method or ""),
        ])
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="rivora-financials-{month}.csv"'},
    )
