# Rivora — B2B Hospitality Resource Exchange

Backend + database for Rivora, a marketplace for hospitality businesses to
share spare resources (space, vehicles, kitchen capacity, furniture, AV
equipment) with each other, with conflict-safe booking and smart matching.

## Project structure

```
rivora/
  backend/
    main.py              FastAPI app entry point
    config.py             DB URL and JWT settings
    database.py            SQLAlchemy engine/session
    models.py               ORM models (businesses, resources, bookings, requests, reviews)
    schemas.py                Pydantic request/response contracts
    auth.py                     JWT + password hashing
    requirements.txt              Python dependencies
    .env.example                   copy to .env and fill in
    routes/
      businesses.py                 signup / login / me
      resources.py                    list / search+match / details
      bookings.py                       create / accept-reject / conflict check
      requests.py                         post a requirement instead of browsing
      reviews.py                            post-booking ratings
    services/
      matching.py                           weighted ranking (price, distance, rating)
      conflict_check.py                       overlap-safe booking logic
  database/
    schema.sql                                CREATE TABLE + seed data
```

## Frontend

Plain HTML/CSS/JS — no build step. Pages:

| Page | Purpose |
|---|---|
| `index.html` | Landing / marketing page |
| `signup.html` / `login.html` | Auth |
| `dashboard.html` | The app itself — Overview, Browse & book, My listings, My bookings, Post a requirement (all as sections in one page) |

**To run it:** open `frontend/index.html` with VS Code's "Live Server" extension (or any static file server). Don't just double-click the file — some browsers block `fetch()` calls from `file://` URLs.

The API base URL is set at the top of `frontend/js/api.js`:
```js
const API_BASE = "http://localhost:8000";
```
Change this if your backend runs somewhere else.

**Design notes:** the visual identity uses Fraunces (serif, for headings) + IBM Plex Sans (body/UI), with a deep ink-green (`#16211D`) and brass (`#B08D4F`) palette — deliberately not the generic cream/terracotta AI-page look. Both fonts load from Google Fonts via `<link>` tags, so an internet connection is needed the first time each page loads.

## Setup

1. Install MySQL locally and start it.
2. Create the database and tables:
   ```
   mysql -u root -p < database/schema.sql
   ```
3. Set up the backend:
   ```
   cd backend
   python -m venv venv
   source venv/bin/activate        # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env            # then edit DATABASE_URL / JWT_SECRET_KEY
   ```
4. Run it:
   ```
   uvicorn main:app --reload --port 8000
   ```
5. Open http://localhost:8000/docs — FastAPI's interactive Swagger UI.
   Your frontend teammate can test every endpoint here without writing any
   frontend code first, and it doubles as always-up-to-date API documentation.

## API contract for the frontend

Base URL during development: `http://localhost:8000`

| Endpoint | Method | Auth? | Purpose |
|---|---|---|---|
| `/auth/signup` | POST | No | Register a business, returns a JWT |
| `/auth/login` | POST | No | Login, returns a JWT |
| `/auth/me` | GET | Yes | Get the logged-in business's profile |
| `/resources` | POST | Yes | Create a resource listing |
| `/resources/search` | GET | No | Search + ranked results (query params: type, location, lat, lon, start_time, end_time, budget, min_capacity) |
| `/resources/{id}` | GET | No | Get one resource's details |
| `/resources/mine/list` | GET | Yes | List the logged-in business's own listings |
| `/bookings` | POST | Yes | Request a booking (conflict-checked) |
| `/bookings/{id}` | PATCH | Yes | Update status: negotiating / confirmed / rejected / cancelled / completed |
| `/bookings/mine` | GET | Yes | All bookings involving the logged-in business |
| `/requirements` | POST | Yes | Post a requirement instead of browsing |
| `/requirements` | GET | No | Browse open requirements (for providers to pitch) |
| `/reviews` | POST | Yes | Review a completed booking |
| `/reviews/resource/{id}` | GET | No | All reviews for a resource |

**Auth header format** once logged in:
```
Authorization: Bearer <access_token>
```

## The one thing to demo live

`POST /bookings` followed by a second, overlapping `POST /bookings` for the
same `resource_id` — or two `PATCH /bookings/{id}` confirm calls for
overlapping slots — will correctly return `409 Conflict` on the second one.
That's the conflict-safe transaction in `services/conflict_check.py` doing
its job, and it's the single strongest proof point for the hackathon judges.
