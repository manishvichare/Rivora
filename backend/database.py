from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base
from config import DATABASE_URL

database_url = make_url(DATABASE_URL)
connect_args = {}

# Supabase requires SSL for hosted Postgres connections. Keep Render Postgres
# and local MySQL behavior unchanged while securing Supabase connections.
if database_url.get_backend_name() == "postgresql" and database_url.host and (
    database_url.host.endswith(".supabase.co")
    or database_url.host.endswith(".pooler.supabase.com")
):
    connect_args["sslmode"] = "require"

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    echo=False,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session per request and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
