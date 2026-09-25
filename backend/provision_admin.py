"""Create or recover the Rivora admin account using the configured database.

Run from the backend directory in an environment that has DATABASE_URL set.
Passwords are requested interactively and are never printed or accepted as args.
"""
from getpass import getpass
import os

from auth import hash_password
from database import SessionLocal
from models import Business


def main() -> None:
    env_name = os.getenv("APP_ENV", "development").lower()
    print(f"Running admin provisioning against configured database (Environment: {env_name}).")
    email = input("Admin email: ").strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise SystemExit("Enter a valid email address.")

    password = getpass("Set admin password (at least 12 characters): ")
    confirmation = getpass("Confirm admin password: ")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters.")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")

    db = SessionLocal()
    try:
        account = db.query(Business).filter(Business.email == email).first()
        created = account is None
        if created:
            name = input("Admin display name: ").strip() or "Rivora Admin"
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