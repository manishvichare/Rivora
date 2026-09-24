from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DECIMAL, DateTime, TIMESTAMP,
    ForeignKey, func
)
from sqlalchemy.orm import relationship
from database import Base


class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    business_type = Column(String(50), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    phone = Column(String(20))
    location = Column(String(255))
    latitude = Column(DECIMAL(9, 6))
    longitude = Column(DECIMAL(9, 6))
    verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    role = Column(String(50), default="business")
    created_at = Column(TIMESTAMP, server_default=func.now())

    resources = relationship("Resource", back_populates="provider", cascade="all, delete")
    bookings_made = relationship("Booking", back_populates="seeker", cascade="all, delete")


class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text)
    capacity = Column(Integer)
    quantity = Column(Integer, default=1)
    price_per_unit = Column(DECIMAL(10, 2), nullable=False)
    price_unit = Column(String(20), nullable=False)
    min_duration = Column(Integer, default=1)
    conditions_text = Column(Text)
    image_url = Column(String(500), nullable=True)
    images = Column(Text, nullable=True)
    location = Column(String(255))
    latitude = Column(DECIMAL(9, 6))
    longitude = Column(DECIMAL(9, 6))
    status = Column(String(20), default="active")
    created_at = Column(TIMESTAMP, server_default=func.now())

    provider = relationship("Business", back_populates="resources")
    bookings = relationship("Booking", back_populates="resource", cascade="all, delete")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    resource_id = Column(Integer, ForeignKey("resources.id", ondelete="CASCADE"), nullable=False)
    seeker_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String(20), default="pending")  # pending, negotiating, confirmed, completed, rejected, cancelled
    requested_price = Column(DECIMAL(10, 2))
    agreed_price = Column(DECIMAL(10, 2))
    notes = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    resource = relationship("Resource", back_populates="bookings")
    seeker = relationship("Business", back_populates="bookings_made")
    review = relationship("Review", back_populates="booking", uselist=False, cascade="all, delete")
    offers = relationship("Offer", back_populates="booking", cascade="all, delete", order_by="desc(Offer.created_at)")
    messages = relationship("Message", back_populates="booking", cascade="all, delete", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    message_text = Column(Text, nullable=False)
    message_type = Column(String(20), default="chat")  # 'chat', 'system', 'offer'
    created_at = Column(TIMESTAMP, server_default=func.now())

    booking = relationship("Booking", back_populates="messages")
    sender = relationship("Business")


class Offer(Base):
    __tablename__ = "offers"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    status = Column(String(20), default="pending")  # pending, accepted, declined
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    booking = relationship("Booking", back_populates="offers")
    sender = relationship("Business", foreign_keys=[sender_id])
    receiver = relationship("Business", foreign_keys=[receiver_id])


class ResourceRequest(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    seeker_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    resource_type = Column(String(50), nullable=False)
    required_capacity = Column(Integer)
    budget = Column(DECIMAL(10, 2))
    location = Column(String(255))
    latitude = Column(DECIMAL(9, 6))
    longitude = Column(DECIMAL(9, 6))
    needed_from = Column(DateTime, nullable=False)
    needed_to = Column(DateTime, nullable=False)
    status = Column(String(20), default="open")
    created_at = Column(TIMESTAMP, server_default=func.now())


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True)
    reviewer_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    booking = relationship("Booking", back_populates="review")


class UserVerification(Base):
    __tablename__ = "user_verifications"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, unique=True)
    aadhaar_hash = Column(String(64), nullable=True)
    aadhaar_masked = Column(String(20), nullable=True)
    pan_masked = Column(String(20), nullable=True)
    email_verified = Column(Boolean, default=False)
    mobile_verified = Column(Boolean, default=False)
    mobile_otp = Column(String(10), nullable=True)
    address_line = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    pincode = Column(String(20), nullable=True)
    status = Column(String(20), default="not_submitted")  # not_submitted, pending, verified, rejected
    rejection_reason = Column(Text, nullable=True)
    verified_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    business = relationship("Business")


class ProviderDocument(Base):
    __tablename__ = "provider_documents"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type = Column(String(50), nullable=False)  # gstin, business_reg, bank_account, food_license, tourism_license, event_permit
    doc_number_masked = Column(String(255), nullable=True)
    file_url = Column(String(500), nullable=True)
    status = Column(String(30), default="not_submitted")  # not_submitted, submitted, under_review, verified, rejected, requires_resubmission
    rejection_reason = Column(Text, nullable=True)
    reviewed_by_admin_id = Column(Integer, ForeignKey("businesses.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    business = relationship("Business", foreign_keys=[business_id])
    reviewer = relationship("Business", foreign_keys=[reviewed_by_admin_id])


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_code = Column(String(50), unique=True, index=True, nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True)
    seeker_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    provider_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    current_offer_amount = Column(DECIMAL(10, 2), nullable=True)
    accepted_offer_amount = Column(DECIMAL(10, 2), nullable=True)
    payment_status = Column(String(30), default="pending")  # pending, processing, secured, released, refund_processing, refunded, failed
    escrow_status = Column(String(30), default="not_held")  # not_held, held, release_pending, released, refund_held, disputed
    status = Column(String(30), default="negotiating")  # negotiating, agreement_pending, payment_pending, payment_secured, escrow_held, confirmed, completed, cancelled, refunded, disputed
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    booking = relationship("Booking")
    seeker = relationship("Business", foreign_keys=[seeker_id])
    provider = relationship("Business", foreign_keys=[provider_id])
    escrow_record = relationship("EscrowRecord", back_populates="transaction", uselist=False, cascade="all, delete")
    invoices = relationship("Invoice", back_populates="transaction", cascade="all, delete")


class EscrowRecord(Base):
    __tablename__ = "escrow_records"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, unique=True)
    escrow_code = Column(String(50), unique=True, index=True, nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    status = Column(String(30), default="held")  # held, release_eligible, released, refunded
    held_at = Column(TIMESTAMP, server_default=func.now())
    release_condition = Column(String(255), default="Resource delivery completion & seeker confirmation")
    released_at = Column(TIMESTAMP, nullable=True)

    transaction = relationship("Transaction", back_populates="escrow_record")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, index=True, nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    seeker_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    provider_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    base_amount = Column(DECIMAL(10, 2), nullable=False)
    tax_gst = Column(DECIMAL(10, 2), default=0.0)
    platform_fee = Column(DECIMAL(10, 2), default=0.0)
    total_amount = Column(DECIMAL(10, 2), nullable=False)
    payment_method = Column(String(50), default="Escrow Secured / UPI / NetBanking")
    status = Column(String(20), default="paid")  # paid, issued, refunded
    issued_at = Column(TIMESTAMP, server_default=func.now())

    transaction = relationship("Transaction", back_populates="invoices")
    booking = relationship("Booking")
    seeker = relationship("Business", foreign_keys=[seeker_id])
    provider = relationship("Business", foreign_keys=[provider_id])


class TermsAcceptance(Base):
    __tablename__ = "terms_acceptances"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    terms_version = Column(String(30), default="v2.4-2026")
    service_agreement_accepted = Column(Boolean, default=True)
    cancellation_policy_accepted = Column(Boolean, default=True)
    accepted_ip = Column(String(50), default="127.0.0.1")
    accepted_at = Column(TIMESTAMP, server_default=func.now())

    booking = relationship("Booking")
    business = relationship("Business")


class RefundRequest(Base):
    __tablename__ = "refund_requests"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    requested_by_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(30), default="requested")  # requested, under_review, approved, processing, completed, rejected
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    transaction = relationship("Transaction")
    booking = relationship("Booking")
    requested_by = relationship("Business")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(30), default="system")  # all, transactions, messages, payments, verification, security, system
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    link_url = Column(String(255), nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    business = relationship("Business")


class SecurityLog(Base):
    __tablename__ = "security_logs"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=True, index=True)
    event_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    business = relationship("Business")


class DuplicateAccountFlag(Base):
    __tablename__ = "duplicate_account_flags"

    id = Column(Integer, primary_key=True, index=True)
    source_business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    matched_business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    matching_signal = Column(String(50), nullable=False)  # phone, email, aadhaar, gstin
    signal_value_masked = Column(String(100), nullable=False)
    status = Column(String(30), default="flagged_for_review")  # flagged_for_review, reviewed_cleared, confirmed_duplicate
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    source_business = relationship("Business", foreign_keys=[source_business_id])
    matched_business = relationship("Business", foreign_keys=[matched_business_id])


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    business_type = Column(String(50), nullable=False)
    email = Column(String(150), nullable=False, index=True)
    phone = Column(String(20), nullable=False)
    location = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=False)
    email_otp_hash = Column(String(255), nullable=False)
    mobile_otp_hash = Column(String(255), nullable=False)
    email_verified = Column(Boolean, default=False)
    mobile_verified = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    resend_cooldown_until = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0)
    consumed = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class PendingLogin(Base):
    __tablename__ = "pending_logins"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(150), nullable=False, index=True)
    otp_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    resend_cooldown_until = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0)
    consumed = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    business = relationship("Business")


