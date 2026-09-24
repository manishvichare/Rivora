import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from the backend folder if present
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# --- Database ---
# Format: mysql+pymysql://<user>:<password>@<host>:<port>/<db_name>
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:manish@localhost:3306/rivora"
)

# --- Auth ---
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "rivora-hackathon-demo-secret-key-2026-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24  # 24 hours
