"""Public, location-filtered weather and operations news for Rivora."""

import asyncio
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

NEWS_API_URL = "https://newsapi.org/v2/everything"
GOOGLE_NEWS_URL = "https://news.google.com/rss/search"
SIGNAL_CACHE_SECONDS = 600
_signal_cache: dict[str, tuple[float, dict]] = {}

TOPIC_TERMS = (
    "rain", "waterlog", "flood", "traffic", "road", "rail", "train", "flight",
    "delay", "storm", "weather", "warning", "cancel", "monsoon", "inundat",
)


def _city_aliases(city: str) -> list[str]:
    normalized = city.casefold()
    if any(name in normalized for name in ("navi mumbai", "panvel", "thane", "mumbai", "andheri", "powai", "vashi")):
        return ["Navi Mumbai", "Mumbai", "Panvel", "Thane", "Sion-Panvel", "Vashi", "Andheri", "Powai"]
    return [city]


def _is_relevant(title: str, description: str, aliases: list[str]) -> bool:
    haystack = f"{title} {description}".casefold()
    local = any(alias.casefold() in haystack for alias in aliases)
    operational = any(term in haystack for term in TOPIC_TERMS)
    return local and operational


def _impact(title: str) -> str:
    words = title.casefold()
    if any(term in words for term in ("flood", "waterlog", "cancel", "closure", "warning", "inundat")):
        return "High"
    if any(term in words for term in ("rain", "delay", "traffic", "storm", "monsoon")):
        return "Moderate"
    return "Low"


def _demo_signals(city: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "provider": "Demo fallback",
        "is_demo": True,
        "signals": [
            {
                "timestamp": now,
                "source": "Rivora sample operations report",
                "impact_level": "Moderate",
                "summary": f"Sample scenario: monitor low-lying roads and venue access around {city} during sustained rain.",
                "url": None,
                "is_demo": True,
            },
            {
                "timestamp": now,
                "source": "Rivora sample travel report",
                "impact_level": "Info",
                "summary": "Sample scenario: confirm staff travel routes and indoor backup capacity before weather-related disruptions.",
                "url": None,
                "is_demo": True,
            },
        ],
    }


async def _newsapi_signals(city: str, client: httpx.AsyncClient, api_key: str) -> list[dict]:
    aliases = _city_aliases(city)
    places = " OR ".join(f'"{place}"' for place in aliases[:8])
    topics = " OR ".join(("rain", "waterlogging", "flood", "traffic", "storm", "weather", "warning", "delay", "cancellation"))
    query = f"({places}) AND ({topics})"
    params = {
        "q": query,
        "from": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(timespec="seconds"),
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": 30,
    }
    response = await client.get(NEWS_API_URL, params=params, headers={"X-Api-Key": api_key})
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "ok":
        raise ValueError("News provider returned an unsuccessful response")

    signals = []
    seen = set()
    for article in payload.get("articles", []):
        title = (article.get("title") or "").strip()
        description = (article.get("description") or "").strip()
        if not title or not _is_relevant(title, description, aliases) or title.casefold() in seen:
            continue
        seen.add(title.casefold())
        source = (article.get("source") or {}).get("name") or "News report"
        signals.append({
            "timestamp": article.get("publishedAt") or datetime.now(timezone.utc).isoformat(),
            "source": source,
            "impact_level": _impact(title),
            "summary": title,
            "url": article.get("url"),
            "is_demo": False,
            "signal_type": "public_news",
        })
        if len(signals) == 3:
            break
    return signals


async def _rss_signals(city: str, client: httpx.AsyncClient) -> list[dict]:
    aliases = _city_aliases(city)
    queries = [
        f'"{city}" rain waterlogging traffic',
        f'"{city}" weather flood transit disruption',
    ]
    if city.casefold() in {"navi mumbai", "mumbai", "panvel"}:
        queries.append('"Sion-Panvel" rain traffic flood')

    async def fetch(query: str) -> str:
        response = await client.get(
            GOOGLE_NEWS_URL,
            params={"hl": "en-IN", "gl": "IN", "ceid": "IN:en", "q": query},
        )
        response.raise_for_status()
        return response.text

    feeds = await asyncio.gather(*(fetch(query) for query in queries))
    signals = []
    seen = set()
    for feed in feeds:
        root = ET.fromstring(feed)
        for item in root.findall("./channel/item"):
            title = (item.findtext("title") or "").strip()
            if not title or not _is_relevant(title, "", aliases) or title.casefold() in seen:
                continue
            published = item.findtext("pubDate")
            try:
                timestamp = parsedate_to_datetime(published).astimezone(timezone.utc).isoformat() if published else None
            except (TypeError, ValueError, OverflowError):
                timestamp = None
            if timestamp is None:
                continue
            if timestamp and datetime.fromisoformat(timestamp) < datetime.now(timezone.utc) - timedelta(days=1):
                continue
            seen.add(title.casefold())
            source_node = item.find("source")
            signals.append({
                "timestamp": timestamp,
                "source": (source_node.text or "Public news report").strip() if source_node is not None else "Public news report",
                "impact_level": _impact(title),
                "summary": title,
                "url": item.findtext("link"),
                "is_demo": False,
                "signal_type": "public_news",
            })
            if len(signals) == 3:
                return signals
    return signals


async def get_local_signals(city: str = "Navi Mumbai") -> dict:
    """Return recent local articles, caching provider responses to protect quotas."""
    city = re.sub(r"\s+", " ", city).strip()[:80] or "Navi Mumbai"
    cache_key = city.casefold()
    now = asyncio.get_running_loop().time()
    cached = _signal_cache.get(cache_key)
    if cached and now - cached[0] < SIGNAL_CACHE_SECONDS:
        return cached[1]

    api_key = os.getenv("NEWS_API_KEY", "").strip()
    result = _demo_signals(city)
    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            if api_key:
                try:
                    signals = await _newsapi_signals(city, client, api_key)
                    if signals:
                        result = {"provider": "NewsAPI", "is_demo": False, "signals": signals}
                except (httpx.HTTPError, ValueError, TypeError):
                    # An expired key or provider limit should not prevent RSS fallback.
                    pass
            if result["is_demo"]:
                try:
                    signals = await _rss_signals(city, client)
                    if signals:
                        result = {"provider": "Google News RSS", "is_demo": False, "signals": signals}
                except (httpx.HTTPError, ET.ParseError, ValueError, TypeError):
                    pass
    except httpx.HTTPError:
        pass

    if not result["signals"]:
        result = _demo_signals(city)
    _signal_cache[cache_key] = (now, result)
    return result
