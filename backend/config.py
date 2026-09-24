import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from the backend folder if present
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# --- Database ---
# Format: mysql+pymysql://<user>:<password>@<host>:<port>/<db_name>
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if os.getenv("APP_ENV", "development").lower() == "production":
        raise RuntimeError("DATABASE_URL must be set for production deployments.")
    DATABASE_URL = "mysql+pymysql://root:manish@localhost:3306/rivora"

DATABASE_URL = DATABASE_URL.strip()

# Render and Supabase PostgreSQL URLs use the psycopg2 driver included in
# backend/requirements.txt.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if "[YOUR-PASSWORD]" in DATABASE_URL or "<YOUR-PASSWORD>" in DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL still contains the password placeholder. Replace it with "
        "the database password in the hosting provider environment settings."
    )

if os.getenv("APP_ENV", "development").lower() == "production" and not DATABASE_URL.startswith(
    ("postgresql://", "postgresql+psycopg2://")
):
    raise RuntimeError("Production DATABASE_URL must point to a PostgreSQL database.")

# --- Auth ---
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    if os.getenv("APP_ENV", "development").lower() == "production":
        raise RuntimeError("JWT_SECRET_KEY must be set for production deployments.")
    JWT_SECRET_KEY = "rivora-hackathon-demo-secret-key-2026-prod"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Simulated authentication code requested for the Render demo deployment.
DEMO_OTP_CODE = "676767"
