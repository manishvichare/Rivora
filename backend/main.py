from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import Base, engine
import models  # noqa: F401
from routes import businesses, resources, bookings, requests as requirements_route, reviews, analytics, verification, transactions, notifications

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Rivora API",
    description="B2B hospitality resource exchange — backend for Rivora",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers both directly and with /api prefix for seamless compatibility
all_routers = [
    businesses.router,
    resources.router,
    bookings.router,
    requirements_route.router,
    reviews.router,
    analytics.router,
    verification.router,
    transactions.router,
    notifications.router,
]
for r in all_routers:
    app.include_router(r)
    app.include_router(r, prefix="/api")

frontend_dir = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/")
def root():
    index_file = frontend_dir / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return {"status": "ok", "service": "Rivora API", "docs": "/docs"}


@app.get("/health")
@app.get("/api/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail={"status": "unhealthy", "database": "unavailable"},
        )
    return {"status": "healthy", "database": "connected"}


# Keep this catch-all mount last so API and health routes take precedence.
if frontend_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
