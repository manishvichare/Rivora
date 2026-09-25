"""Create or recover the Rivora admin account using the configured database."""
import os

from auth import hash_password
from database import SessionLocal
from models import Business


def main() -> None:
    env_name = os.getenv("APP_ENV", "development").lower()
    print(f"Running admin provisioning against configured database (Environment: {env_name}).")
    
    # Direct set kela ahe, terminal var type karaychi garaj nahi
    email = "vicharemanish717@gmail.com"
    password = "Admin@12345678"

    db = SessionLocal()
    try:
        account = db.query(Business).filter(Business.email == email).first()
        created = account is None
        if created:
            name = "Rivora Admin"
            account = Business(
                name=name,
                business_type="admin",
                email=email,
                password_hash=hash_password(password),
                verified=True,
                is_admin=True,
                role="admin",
            )
            db.add(account)
        else:
            account.password_hash = hash_password(password)
            account.is_admin = True
            account.role = "admin"

        db.commit()
        result = "Created" if created else "Updated"
        print(f"{result} admin access for {email}. Sign in at the Rivora login page.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()