from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

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

# Mount frontend directory so the entire app can be run and browsed directly
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/frontend", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")


@app.get("/")
def root():
    # If frontend exists, redirect root to the frontend landing page
    if frontend_dir.exists() and (frontend_dir / "index.html").exists():
        return RedirectResponse(url="/frontend/index.html")
    return {"status": "ok", "service": "Rivora API", "docs": "/docs"}


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "healthy"}
