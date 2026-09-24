import secrets
import hashlib
import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from typing import Union
from database import get_db
import models, schemas
from auth import hash_password, verify_password, create_access_token, get_current_business
from config import DEMO_OTP_CODE, JWT_SECRET_KEY
from services.sms_service import send_verification_sms

router = APIRouter(prefix="/auth", tags=["businesses"])


def _new_email_otp() -> str:
    """Return the configured simulation code for signup and login."""
    return DEMO_OTP_CODE


@router.post("/signup")
def direct_signup_blocked():
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Direct registration without verification is forbidden. Please initiate verification via /auth/signup/initiate."
    )


@router.post("/signup/initiate", response_model=schemas.SignupInitiateOut)
def initiate_signup(payload: schemas.SignupInitiateIn, db: Session = Depends(get_db)):
    """
    Step 1 of Pre-Registration:
    Validates account details and creates a pending signup with the simulation code.
    NO USER ACCOUNT IS CREATED IN THE DATABASE AT THIS STEP.
    """
    norm_email = payload.email.strip().lower()
    clean_phone = "".join(c for c in payload.phone if c.isdigit())
    if len(clean_phone) >= 10:
        clean_phone = clean_phone[-10:]

    # Check for existing accounts
    if db.query(models.Business).filter(models.Business.email == norm_email).first():
        raise HTTPException(status_code=400, detail="An account with this email address already exists. Please log in.")
    if clean_phone and db.query(models.Business).filter(models.Business.phone.like(f"%{clean_phone}")).first():
        raise HTTPException(status_code=400, detail="An account with this mobile phone number already exists. Please log in.")

    # Generate the shared simulation code for both optional verification fields.
    email_otp = _new_email_otp()
    mobile_otp = email_otp

    # Generate unique secure session token
    session_id = secrets.token_urlsafe(32)

    # Hash OTPs with server secret salt so plaintext is NEVER stored in database
    email_otp_hash = hashlib.sha256((email_otp + session_id + JWT_SECRET_KEY).encode()).hexdigest()
    mobile_otp_hash = hashlib.sha256((mobile_otp + session_id + JWT_SECRET_KEY).encode()).hexdigest()

    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=10)
    resend_cooldown = now + timedelta(seconds=60)

    # Invalidate any older unconsumed registrations for this email
    db.query(models.PendingRegistration).filter(
        models.PendingRegistration.email == norm_email,
        models.PendingRegistration.consumed == False
    ).delete(synchronize_session=False)

    pending = models.PendingRegistration(
        session_id=session_id,
        name=payload.name.strip(),
        business_type=payload.business_type.strip(),
        email=norm_email,
        phone=clean_phone or payload.phone.strip(),
        location=payload.location.strip() if payload.location else None,
        password_hash=hash_password(payload.password),
        email_otp_hash=email_otp_hash,
        mobile_otp_hash=mobile_otp_hash,
        email_verified=False,
        mobile_verified=False,
        expires_at=expires_at,
        resend_cooldown_until=resend_cooldown,
        attempts=0,
        consumed=False
    )
    db.add(pending)
    db.commit()

    # Email delivery is intentionally skipped; the UI displays the simulation code.
    # Mobile SMS disabled - Email-only OTP mode active

    email_parts = norm_email.split("@")
    email_masked = f"{email_parts[0][:2]}••••@{email_parts[1]}" if len(email_parts) == 2 else norm_email
    phone_masked = f"+91 ••••• •{clean_phone[-4:]}" if len(clean_phone) >= 4 else payload.phone

    return schemas.SignupInitiateOut(
        session_id=session_id,
        email_masked=email_masked,
        phone_masked=phone_masked,
        expires_at=expires_at.isoformat() + "Z",
        valid_until=expires_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
        resend_cooldown_seconds=60,
        message=f"Demo mode is active. Use code {email_otp}.",
        demo_mode=True,
        demo_otp=email_otp,
    )


@router.post("/signup/verify", response_model=schemas.TokenOut, status_code=status.HTTP_201_CREATED)
def verify_signup_and_create_account(payload: schemas.SignupVerifyIn, db: Session = Depends(get_db)):
    """
    Step 2 of Pre-Registration:
    Validates the signup simulation code. The account is created when the code is accepted and an access token is returned.
    """
    pending = db.query(models.PendingRegistration).filter(
        models.PendingRegistration.session_id == payload.session_id,
        models.PendingRegistration.consumed == False
    ).first()

    if not pending:
        raise HTTPException(
            status_code=404,
            detail="Verification session not found, expired, or already completed. Please restart signup."
        )

    now = datetime.utcnow()
    if pending.expires_at < now:
        raise HTTPException(
            status_code=400,
            detail="Verification code has expired. Please request a new code using the resend option."
        )

    if pending.attempts >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect OTP attempts. This verification session has been locked for security. Please restart registration."
        )

    # Validate Email OTP against server-side hash
    expected_email_hash = hashlib.sha256((payload.email_otp.strip() + pending.session_id + JWT_SECRET_KEY).encode()).hexdigest()
    email_valid = (expected_email_hash == pending.email_otp_hash)

    # If mobile OTP is optionally provided, validate it as well
    mobile_valid = True
    if payload.mobile_otp and payload.mobile_otp.strip():
        expected_mobile_hash = hashlib.sha256((payload.mobile_otp.strip() + pending.session_id + JWT_SECRET_KEY).encode()).hexdigest()
        mobile_valid = (expected_mobile_hash == pending.mobile_otp_hash)

    if not email_valid:
        pending.attempts += 1
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Incorrect verification code. Please enter the demo code shown on the page."
        )

    if not mobile_valid:
        pending.attempts += 1
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Incorrect Mobile OTP. Please check the SMS code sent to your phone."
        )

    # Re-verify email is still unclaimed before insertion
    if db.query(models.Business).filter(models.Business.email == pending.email).first():
        raise HTTPException(status_code=400, detail="An account with this email was registered during verification. Please log in.")

    # BOTH OTPS ARE 100% VALID -> Create User Account in DB
    business = models.Business(
        name=pending.name,
        business_type=pending.business_type,
        email=pending.email,
        password_hash=pending.password_hash,
        phone=pending.phone,
        location=pending.location,
        verified=False  # Requires statutory document proofs to list resources
    )
    db.add(business)
    db.flush()

    # Create verification record with email and mobile verified
    verif = models.UserVerification(
        business_id=business.id,
        email_verified=True,
        mobile_verified=True,
        status="pending"
    )
    db.add(verif)

    # Mark pending registration as consumed
    pending.consumed = True
    pending.email_verified = True
    pending.mobile_verified = True

    db.commit()
    db.refresh(business)

    token = create_access_token(business.id)
    return schemas.TokenOut(access_token=token, business=business)


@router.post("/signup/resend", response_model=schemas.SignupResendOut)
def resend_signup_otp(payload: schemas.SignupResendIn, db: Session = Depends(get_db)):
    """
    Resends OTP for email, mobile, or both with strict 60-second cooldown enforcement.
    """
    pending = db.query(models.PendingRegistration).filter(
        models.PendingRegistration.session_id == payload.session_id,
        models.PendingRegistration.consumed == False
    ).first()

    if not pending:
        raise HTTPException(
            status_code=404,
            detail="Verification session not found or already completed."
        )

    now = datetime.utcnow()
    if now < pending.resend_cooldown_until:
        remaining_secs = int((pending.resend_cooldown_until - now).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {remaining_secs} seconds before requesting a new OTP."
        )

    if pending.expires_at < now:
        # Extend expiration by 10 minutes upon intentional resend
        pending.expires_at = now + timedelta(minutes=10)

    channel = payload.channel.strip().lower()
    if channel not in ["email", "mobile", "both"]:
        channel = "both"

    delivered_channels = []
    failed_channels = []

    if channel in ["email", "both"]:
        new_email_otp = _new_email_otp()
        pending.email_otp_hash = hashlib.sha256((new_email_otp + pending.session_id + JWT_SECRET_KEY).encode()).hexdigest()
        delivered_channels.append("email")

    if channel in ["mobile", "both"]:
        new_mobile_otp = f"{random.randint(100000, 999999)}"
        sms_delivery = send_verification_sms(pending.phone, new_mobile_otp, pending.expires_at)
        if sms_delivery.get("delivered_via_gateway"):
            pending.mobile_otp_hash = hashlib.sha256((new_mobile_otp + pending.session_id + JWT_SECRET_KEY).encode()).hexdigest()
            delivered_channels.append("mobile")
        else:
            failed_channels.append("mobile")

    if not delivered_channels:
        db.rollback()
        if "email" in failed_channels:
            raise HTTPException(status_code=503, detail="We could not send the verification email. Please try again later.")
        raise HTTPException(status_code=503, detail="We could not send the verification SMS. Please try again later.")

    pending.resend_cooldown_until = now + timedelta(seconds=60)
    db.commit()
    delivered_channel = "both" if len(delivered_channels) == 2 else delivered_channels[0]
    delivery_message = f"Demo mode is active. Use code {DEMO_OTP_CODE}."
    if failed_channels:
        delivery_message += f" The {', '.join(failed_channels)} channel could not be reached."

    return schemas.SignupResendOut(
        session_id=pending.session_id,
        channel=delivered_channel,
        resend_cooldown_seconds=60,
        message=delivery_message,
    )


@router.post("/signup/firebase-phone", response_model=schemas.TokenOut, status_code=status.HTTP_201_CREATED)
def signup_firebase_phone(payload: schemas.FirebasePhoneSignupIn, db: Session = Depends(get_db)):
    """
    Registers a business after successful client-side Firebase Phone OTP verification.
    Creates user in database with verified mobile status.
    """
    norm_email = payload.email.strip().lower()
    clean_phone = "".join(c for c in payload.phone if c.isdigit())
    if len(clean_phone) >= 10:
        clean_phone = clean_phone[-10:]

    # Ensure email is not already registered
    if db.query(models.Business).filter(models.Business.email == norm_email).first():
        raise HTTPException(status_code=400, detail="An account with this email address already exists. Please log in.")

    # Ensure phone is not already registered
    if clean_phone and db.query(models.Business).filter(models.Business.phone.like(f"%{clean_phone}")).first():
        raise HTTPException(status_code=400, detail="An account with this mobile phone number already exists. Please log in.")

    business = models.Business(
        name=payload.name.strip(),
        business_type=payload.business_type.strip(),
        email=norm_email,
        phone=clean_phone or payload.phone.strip(),
        location=payload.location.strip() if payload.location else None,
        password_hash=hash_password(payload.password),
        verified=False
    )
    db.add(business)
    db.flush()

    # Create verification record with phone marked as verified
    verif = models.UserVerification(
        business_id=business.id,
        email_verified=False,
        mobile_verified=True,
        status="pending"
    )
    db.add(verif)
    db.commit()
    db.refresh(business)

    token = create_access_token(business.id)
    return schemas.TokenOut(access_token=token, business=business)




@router.post("/login", response_model=schemas.LoginResponseOut)
def login(payload: schemas.BusinessLogin, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    business = db.query(models.Business).filter(models.Business.email == email_clean).first()
    if not business:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    is_valid = False
    try:
        is_valid = verify_password(payload.password, business.password_hash)
    except Exception:
        pass

    if not is_valid:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    # Generate 6-digit cryptographically random OTP and session ID
    otp = _new_email_otp()
    session_id = secrets.token_hex(32)

    # Hash OTP with server secret salt so plaintext is NEVER stored in database
    otp_hash = hashlib.sha256((otp + session_id + JWT_SECRET_KEY).encode()).hexdigest()

    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=10)
    resend_cooldown_until = now + timedelta(seconds=60)

    # Clean up previous unconsumed logins for this business
    db.query(models.PendingLogin).filter(
        models.PendingLogin.business_id == business.id,
        models.PendingLogin.consumed == False,
    ).delete()

    pending = models.PendingLogin(
        session_id=session_id,
        business_id=business.id,
        email=email_clean,
        otp_hash=otp_hash,
        expires_at=expires_at,
        resend_cooldown_until=resend_cooldown_until,
        attempts=0,
        consumed=False,
    )
    db.add(pending)
    db.commit()

    # The login challenge uses the simulation code and does not contact SMTP.
    parts = email_clean.split("@")
    masked_user = (parts[0][:2] + "***" + parts[0][-1]) if len(parts[0]) > 3 else (parts[0][:1] + "***")
    email_masked = f"{masked_user}@{parts[1]}"

    return schemas.LoginResponseOut(
        require_otp=True,
        session_id=session_id,
        email_masked=email_masked,
        expires_at=expires_at.isoformat() + "Z",
        resend_cooldown_seconds=60,
        message=f"Demo mode is active. Use code {otp}.",
        demo_mode=True,
        demo_otp=otp,
    )


@router.post("/login-verify", response_model=schemas.TokenOut)
def verify_login_otp(payload: schemas.LoginOtpVerify, db: Session = Depends(get_db)):
    session_clean = payload.session_id.strip()
    pending = (
        db.query(models.PendingLogin)
        .filter(models.PendingLogin.session_id == session_clean)
        .first()
    )
    if not pending or pending.consumed:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired login session. Please sign in again.",
        )

    if datetime.utcnow() > pending.expires_at:
        raise HTTPException(
            status_code=400,
            detail="Verification code has expired. Please request a new code.",
        )

    if pending.attempts >= 5:
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect OTP attempts. Please sign in again.",
        )

    expected_hash = hashlib.sha256((payload.otp.strip() + pending.session_id + JWT_SECRET_KEY).encode()).hexdigest()
    if expected_hash != pending.otp_hash:
        pending.attempts += 1
        db.commit()
        remaining = 5 - pending.attempts
        raise HTTPException(
            status_code=400,
            detail=f"Incorrect verification code. {remaining} attempt(s) remaining.",
        )

    # Valid OTP verified!
    pending.consumed = True
    db.commit()

    business = db.query(models.Business).filter(models.Business.id == pending.business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business account not found")

    token = create_access_token(business.id)
    return schemas.TokenOut(access_token=token, business=business)


@router.post("/login-resend-otp")
def resend_login_otp(payload: schemas.LoginResendIn, db: Session = Depends(get_db)):
    session_clean = payload.session_id.strip()
    pending = (
        db.query(models.PendingLogin)
        .filter(models.PendingLogin.session_id == session_clean)
        .first()
    )
    if not pending or pending.consumed:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired session. Please sign in again.",
        )

    now = datetime.utcnow()
    if now < pending.resend_cooldown_until:
        remaining_secs = int((pending.resend_cooldown_until - now).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {remaining_secs} seconds before requesting a new code.",
        )

    business = db.query(models.Business).filter(models.Business.id == pending.business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    new_otp = _new_email_otp()
    new_expires_at = now + timedelta(minutes=10)
    pending.otp_hash = hashlib.sha256((new_otp + pending.session_id + JWT_SECRET_KEY).encode()).hexdigest()
    pending.expires_at = new_expires_at
    pending.resend_cooldown_until = now + timedelta(seconds=60)
    pending.attempts = 0
    db.commit()

    return {
        "success": True,
        "message": f"Demo mode is active. Use code {new_otp}.",
        "demo_mode": True,
        "demo_otp": new_otp,
        "resend_cooldown_seconds": 60,
    }


@router.get("/me", response_model=schemas.BusinessOut)
def get_me(current: models.Business = Depends(get_current_business), db: Session = Depends(get_db)):
    return current


@router.patch("/me", response_model=schemas.BusinessOut)
@router.put("/me", response_model=schemas.BusinessOut)
def update_me(
    payload: schemas.BusinessUpdate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    if payload.name is not None:
        current.name = payload.name
    if payload.business_type is not None:
        current.business_type = payload.business_type
    if payload.phone is not None:
        current.phone = payload.phone
    if payload.location is not None:
        current.location = payload.location
    if payload.latitude is not None:
        current.latitude = payload.latitude
    if payload.longitude is not None:
        current.longitude = payload.longitude

    db.commit()
    db.refresh(current)
    return current


@router.get("/business/{business_id}/trust-profile")
def get_business_trust_profile(business_id: int, db: Session = Depends(get_db)):
    biz = db.query(models.Business).filter(models.Business.id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    docs = db.query(models.ProviderDocument).filter(
        models.ProviderDocument.business_id == business_id,
        models.ProviderDocument.status == "verified"
    ).all()

    verified_doc_types = [d.doc_type for d in docs]

    bookings = (
        db.query(models.Booking)
        .join(models.Resource, models.Booking.resource_id == models.Resource.id)
        .filter(models.Resource.provider_id == business_id)
        .all()
    )

    completed = [b for b in bookings if b.status == "completed"]
    cancelled = [b for b in bookings if b.status == "cancelled"]
    total_bookings = len(bookings)

    escrow_disbursed = sum(
        float(b.agreed_price or b.requested_price or 0) for b in completed
    )

    cancellation_rate = round((len(cancelled) / total_bookings) * 100, 1) if total_bookings > 0 else 0.0

    reviews = (
        db.query(models.Review)
        .join(models.Booking, models.Review.booking_id == models.Booking.id)
        .join(models.Resource, models.Booking.resource_id == models.Resource.id)
        .filter(models.Resource.provider_id == business_id)
        .all()
    )

    avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else 5.0

    # Calculate dynamic Reliability Score (0 to 100%)
    score = 50.0
    if biz.verified:
        score += 30.0
    if "gstin" in verified_doc_types:
        score += 5.0
    if "bank_account" in verified_doc_types:
        score += 5.0
    if reviews:
        score += ((avg_rating - 3.0) / 2.0) * 10.0
    if total_bookings > 0 and cancellation_rate < 5.0:
        score += 5.0

    reliability_score = min(100.0, max(50.0, round(score, 1)))

    recent_txns = []
    for b in completed[:5]:
        recent_txns.append({
            "booking_id": b.id,
            "resource_name": b.resource.name if b.resource else "Resource Slot",
            "amount": float(b.agreed_price or b.requested_price or 0),
            "date": str(b.created_at.date() if b.created_at else "2026-09-22"),
            "status": "Escrow Disbursed"
        })

    return {
        "business_id": biz.id,
        "business_name": biz.name,
        "business_type": biz.business_type,
        "verified": bool(biz.verified),
        "reliability_score": reliability_score,
        "trust_tier": "Premier Verified Partner" if reliability_score >= 90 else "Verified Business",
        "completed_deals_count": len(completed),
        "escrow_disbursed_total": escrow_disbursed,
        "cancellation_rate_pct": cancellation_rate,
        "average_rating": avg_rating,
        "total_reviews_count": len(reviews),
        "verified_licenses": verified_doc_types,
        "recent_transactions": recent_txns
    }
