"""Create or recover the Rivora admin account using the configured database."""
import os

from auth import hash_password
from database import SessionLocal
from models import Business, UserVerification


def auto_provision_admin() -> None:
    env_name = os.getenv("APP_ENV", "development").lower()
    email = "vicharemanish717@gmail.com"
    password = "Admin@12345678"

    db = SessionLocal()
    try:
        account = db.query(Business).filter(Business.email == email).first()
        created = account is None
        if created:
            account = Business(
                name="MVVERSE",
                business_type="Hotel",
                email=email,
                phone="9405874728",
                password_hash=hash_password(password),
                verified=True,
                is_admin=True,
                role="admin",
            )
            db.add(account)
            db.flush()
        else:
            account.password_hash = hash_password(password)
            account.is_admin = True
            account.role = "admin"
            account.verified = True
            if not account.phone:
                account.phone = "9405874728"
            db.flush()

        verif = db.query(UserVerification).filter_by(business_id=account.id).first()
        if not verif:
            verif = UserVerification(
                business_id=account.id,
                email_verified=True,
                mobile_verified=True,
                status="verified",
            )
            db.add(verif)
        else:
            verif.email_verified = True
            verif.mobile_verified = True
            verif.status = "verified"

        db.commit()
        result = "Created" if created else "Updated"
        print(f"[Provision] {result} admin account for {email} (Environment: {env_name})")
    except Exception as exc:
        db.rollback()
        print(f"[Provision] Warning: {exc}")
    finally:
        db.close()


def main() -> None:
    auto_provision_admin()


if __name__ == "__main__":
    main()