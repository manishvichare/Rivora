import json
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Union
from datetime import datetime


# ---------- Business ----------
class BusinessSignup(BaseModel):
    name: str
    business_type: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    verification_token: Optional[str] = None


class SignupInitiateIn(BaseModel):
    name: str
    business_type: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: str
    location: Optional[str] = None


class SignupInitiateOut(BaseModel):
    session_id: str
    email_masked: str
    phone_masked: str
    expires_at: str
    valid_until: str
    resend_cooldown_seconds: int = 60
    message: str


class SignupVerifyIn(BaseModel):
    session_id: str
    email_otp: str
    mobile_otp: Optional[str] = None


class SignupResendIn(BaseModel):
    session_id: str
    channel: str = "both"  # "email", "mobile", "both"


class SignupResendOut(BaseModel):
    session_id: str
    channel: str
    resend_cooldown_seconds: int = 60
    message: str


class FirebasePhoneSignupIn(BaseModel):
    name: str
    business_type: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: str
    location: Optional[str] = None
    firebase_uid: Optional[str] = None




class BusinessLogin(BaseModel):
    email: EmailStr
    password: str


class LoginResponseOut(BaseModel):
    require_otp: bool = True
    session_id: str
    email_masked: str
    expires_at: str
    resend_cooldown_seconds: int = 60
    message: str


class LoginOtpVerify(BaseModel):
    session_id: str
    otp: str


class LoginResendIn(BaseModel):
    session_id: str


class BusinessOut(BaseModel):
    id: int
    name: str
    business_type: str
    email: EmailStr
    phone: Optional[str] = None
    location: Optional[str] = None
    verified: bool
    is_admin: bool = False
    role: Optional[str] = "business"

    class Config:
        from_attributes = True


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    business_type: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    business: BusinessOut


# ---------- Resource ----------
class ResourceCreate(BaseModel):
    type: str
    name: str
    description: Optional[str] = None
    capacity: Optional[int] = None
    quantity: int = 1
    price_per_unit: float
    price_unit: str  # per_hour | per_day
    min_duration: int = 1
    conditions_text: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[Union[List[str], str]] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ResourceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    capacity: Optional[int] = None
    quantity: Optional[int] = None
    price_per_unit: Optional[float] = None
    price_unit: Optional[str] = None
    min_duration: Optional[int] = None
    conditions_text: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[Union[List[str], str]] = None
    location: Optional[str] = None
    status: Optional[str] = None


class ResourceOut(BaseModel):
    id: int
    provider_id: int
    provider_name: Optional[str] = None
    type: str
    name: str
    description: Optional[str] = None
    capacity: Optional[int] = None
    quantity: int
    price_per_unit: float
    price_unit: str
    min_duration: int
    conditions_text: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None
    location: Optional[str] = None
    status: str
    provider_verified: bool = False
    match_score: Optional[float] = None  # populated only by /resources/search

    @field_validator("images", mode="before")
    @classmethod
    def parse_images(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(x) for x in parsed if x]
                return [parsed]
            except Exception:
                return [x.strip() for x in v.split(",") if x.strip()]
        return v

    class Config:
        from_attributes = True


# ---------- Offers ----------
class OfferCreate(BaseModel):
    amount: float
    notes: Optional[str] = None


class OfferOut(BaseModel):
    id: int
    booking_id: int
    sender_id: int
    receiver_id: int
    amount: float
    status: str
    notes: Optional[str] = None
    created_at: datetime
    sender_name: Optional[str] = None
    receiver_name: Optional[str] = None

    class Config:
        from_attributes = True


# ---------- Booking ----------
class BookingCreate(BaseModel):
    resource_id: int
    start_time: datetime
    end_time: datetime
    requested_price: Optional[float] = None
    notes: Optional[str] = None


class BookingStatusUpdate(BaseModel):
    status: str  # negotiating | confirmed | accepted | rejected | declined | cancelled | completed
    agreed_price: Optional[float] = None
    notes: Optional[str] = None


class BookingOut(BaseModel):
    id: int
    resource_id: int
    resource_name: Optional[str] = None
    resource_type: Optional[str] = None
    seeker_id: int
    seeker_name: Optional[str] = None
    provider_id: Optional[int] = None
    provider_name: Optional[str] = None
    counterpart_name: Optional[str] = None
    direction: Optional[str] = None  # 'received' or 'sent'
    start_time: datetime
    end_time: datetime
    status: str
    requested_price: Optional[float] = None
    agreed_price: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    latest_offer_amount: Optional[float] = None
    offers: list[OfferOut] = []

    # Negotiation summary & permission fields
    current_price: Optional[float] = None
    price_unit: Optional[str] = None
    seeker_offer: Optional[float] = None
    provider_counter_offer: Optional[float] = None
    active_offer: Optional[float] = None
    active_offer_by: Optional[str] = None
    negotiation_status: Optional[str] = None
    can_confirm: bool = False
    can_counter: bool = False
    is_provider: bool = False
    negotiation_history: list[dict] = []
    transaction_code: Optional[str] = None

    class Config:
        from_attributes = True


class AnalyticsSummaryOut(BaseModel):
    provider_earnings_month: float = 0.0
    provider_utilization_pct: int = 0
    provider_completed_count: int = 0
    provider_active_listings: int = 0
    provider_pending_count: int = 0
    seeker_savings_month: float = 0.0
    seeker_spent_month: float = 0.0
    seeker_completed_count: int = 0
    monthly_earnings: list[dict] = []
    monthly_savings: list[dict] = []
    utilization_by_resource: list[dict] = []
    provider_history: list[dict] = []
    seeker_history: list[dict] = []
    avg_match_score: int = 88


# ---------- Requirement post ----------
class RequirementCreate(BaseModel):
    resource_type: str
    required_capacity: Optional[int] = None
    budget: Optional[float] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    needed_from: datetime
    needed_to: datetime


class RequirementOut(RequirementCreate):
    id: int
    seeker_id: int
    status: str

    class Config:
        from_attributes = True


# ---------- Review ----------
class ReviewCreate(BaseModel):
    booking_id: int
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class ReviewOut(ReviewCreate):
    id: int
    reviewer_id: int
    reviewer_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Chat Message ----------
class MessageCreate(BaseModel):
    message_text: str
    message_type: Optional[str] = "chat"


class MessageOut(BaseModel):
    id: int
    booking_id: int
    sender_id: int
    sender_name: Optional[str] = None
    message_text: str
    message_type: str
    created_at: datetime
    is_me: Optional[bool] = False

    class Config:
        from_attributes = True


# ---------- Verification Schemas ----------
class SeekerVerificationSubmit(BaseModel):
    aadhaar_number: Optional[str] = None
    pan_number: Optional[str] = None
    address_line: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None


class MobileOtpRequest(BaseModel):
    mobile_number: str


class MobileOtpVerify(BaseModel):
    mobile_number: str
    otp: str


class UserVerificationOut(BaseModel):
    id: int
    business_id: int
    aadhaar_masked: Optional[str] = None
    aadhaar_number_masked: Optional[str] = None
    aadhaar_verified: bool = False
    pan_masked: Optional[str] = None
    pan_number_masked: Optional[str] = None
    pan_verified: bool = False
    email_verified: bool = False
    mobile_verified: bool = False
    mobile_number: Optional[str] = None
    address_line: Optional[str] = None
    address: Optional[str] = None
    address_verified: bool = False
    city: Optional[str] = None
    pincode: Optional[str] = None
    status: str
    is_fully_verified: bool = False
    rejection_reason: Optional[str] = None
    verified_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProviderDocSubmit(BaseModel):
    doc_type: str  # gstin, business_reg, business_address, bank_account, food_license, tourism_license, event_permit
    doc_number: Optional[str] = None
    file_url: Optional[str] = None
    doc_url: Optional[str] = None
    trade_name: Optional[str] = None
    reg_authority: Optional[str] = None
    address_text: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    auto_verify: Optional[bool] = False


class ProviderDocOut(BaseModel):
    id: int
    business_id: int
    business_name: Optional[str] = None
    doc_type: str
    doc_number_masked: Optional[str] = None
    file_url: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProviderVerificationSummary(BaseModel):
    business_id: int
    business_name: str
    is_verified: bool = False
    is_fully_verified: bool = False
    gstin_verified: bool = False
    gstin_status: str = "not_submitted"
    gstin_number_masked: Optional[str] = None
    business_reg_verified: bool = False
    business_reg_status: str = "not_submitted"
    business_reg_masked: Optional[str] = None
    business_address_verified: bool = False
    business_address_status: str = "not_submitted"
    business_address_masked: Optional[str] = None
    bank_account_verified: bool = False
    bank_account_status: str = "not_submitted"
    bank_account_masked: Optional[str] = None
    licenses_verified: bool = False
    documents: list[ProviderDocOut] = []


class AdminDocReview(BaseModel):
    status: Optional[str] = None
    action: Optional[str] = None
    rejection_reason: Optional[str] = None


# ---------- Transaction & Escrow Schemas ----------
class TransactionOut(BaseModel):
    id: int
    transaction_code: str
    booking_id: int
    seeker_id: int
    seeker_name: Optional[str] = None
    provider_id: int
    provider_name: Optional[str] = None
    resource_id: Optional[int] = None
    resource_name: Optional[str] = None
    amount: float
    current_offer_amount: Optional[float] = None
    accepted_offer_amount: Optional[float] = None
    payment_status: str
    escrow_status: str
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EscrowOut(BaseModel):
    id: int
    transaction_id: int
    escrow_code: str
    amount: float
    status: str
    held_at: Optional[datetime] = None
    release_condition: str
    released_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    transaction_id: int
    booking_id: int
    seeker_name: str
    provider_name: str
    resource_name: str
    base_amount: float
    tax_gst: float
    platform_fee: float
    total_amount: float
    payment_method: str
    status: str
    issued_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TermsAcceptRequest(BaseModel):
    terms_version: Optional[str] = "v2.4-2026"
    service_agreement: bool = True
    cancellation_policy: bool = True


class TermsAcceptanceOut(BaseModel):
    id: int
    booking_id: int
    transaction_id: Optional[int] = None
    business_id: int
    terms_version: str
    accepted_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RefundRequestCreate(BaseModel):
    reason: str
    amount: Optional[float] = None


class RefundRequestOut(BaseModel):
    id: int
    transaction_id: int
    booking_id: int
    requested_by_id: int
    requested_by_name: Optional[str] = None
    amount: float
    reason: str
    status: str
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminRefundReview(BaseModel):
    status: str  # approved, rejected
    rejection_reason: Optional[str] = None


class PaymentProcessIn(BaseModel):
    payment_method: str  # upi, card, netbanking, wallet, international
    payment_type: Optional[str] = "full"  # full, advance
    advance_percentage: Optional[int] = 25  # 20, 25, 50
    upi_id: Optional[str] = None
    card_last4: Optional[str] = None
    card_network: Optional[str] = None
    bank_name: Optional[str] = None
    wallet_name: Optional[str] = None
    currency: Optional[str] = "INR"


class PaymentProcessOut(BaseModel):
    success: bool
    transaction_code: str
    booking_id: int
    amount_paid: float
    total_amount: float
    payment_type: str
    payment_method: str
    escrow_status: str
    payment_reference: str
    invoice_number: Optional[str] = None
    message: str


# ---------- Notification Schemas ----------
class NotificationOut(BaseModel):
    id: int
    business_id: int
    category: str
    title: str
    message: str
    link_url: Optional[str] = None
    read: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Security & Duplicate Flags ----------
class SecurityLogOut(BaseModel):
    id: int
    business_id: Optional[int] = None
    event_type: str
    description: str
    ip_address: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DuplicateFlagOut(BaseModel):
    id: int
    source_business_id: int
    source_name: Optional[str] = None
    matched_business_id: int
    matched_name: Optional[str] = None
    matching_signal: str
    signal_value_masked: str
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


