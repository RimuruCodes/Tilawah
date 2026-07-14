"""
Programmatic SEO Router for Tilawah.

Exposes two cache-optimised, server-side rendered routes:

    GET /surah/{surah_number}            → full Surah hub page
    GET /ayah/{surah_number}/{ayah_number}  → individual Ayah landing page

Design notes
------------
* Routing lives here; data access + SEO assembly lives in `services/seo_service.py`.
* Templates are rendered with Jinja2 and returned as `HTMLResponse`.
* Each route sets per-URL HTTP caching headers so that reverse proxies
  (Cloudflare, Nginx, Varnish) and the browser can serve thousands of pages
  without hitting the database on every request.
* This router is intentionally self-contained: import it once in the host
  app's `main.py` with `app.include_router(seo_router)` and the funnel is live.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.seo_service import (
    build_ayah_seo,
    build_surah_seo,
    get_ayah,
    get_surah,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Router + template configuration
# ──────────────────────────────────────────────────────────────────────────────
seo_router = APIRouter(tags=["SEO Pages"])

# Adjust the directory to match your project layout.
templates = Jinja2Templates(directory="app/templates")

# Cache durations (tune for your CDN strategy)
SURAH_CACHE_SECONDS: int = 3600      # 1 hour
AYAH_CACHE_SECONDS: int = 86400      # 24 hours — ayah text never changes


# ──────────────────────────────────────────────────────────────────────────────
# Database dependency (injected from the host project)
# ──────────────────────────────────────────────────────────────────────────────
async def get_db_session() -> AsyncSession:
    """
    Yield an async SQLAlchemy session.

    The host project should provide its own ``get_db`` dependency; this is a
    thin shim so that unit tests can override it with ``app.dependency_overrides``.
    """
    try:
        from app.db.session import async_session_factory  # type: ignore
    except ImportError:
        raise RuntimeError(
            "Tilawah SEO router requires an async session factory at "
            "'app.db.session.async_session_factory'. Override the 'get_db_session' "
            "dependency if your path differs."
        )

    async with async_session_factory() as session:
        yield session


# ──────────────────────────────────────────────────────────────────────────────
# Route: Surah hub page
# ──────────────────────────────────────────────────────────────────────────────
@seo_router.get("/surah/{surah_number}", response_class=HTMLResponse)
async def surah_landing_page(
    request: Request,
    surah_number: int,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        surah = await get_surah(db, surah_number)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Surah not found")
    except Exception:
        logger.exception("Failed to fetch surah %s", surah_number)
        raise HTTPException(status_code=500, detail="Internal server error")

    seo = build_surah_seo(surah)

    response = templates.TemplateResponse(
        "surah_landing.html",
        {
            "request": request,
            "surah": surah.to_dict(),
            "seo": seo,
        },
    )
    _apply_cache_headers(response, SURAH_CACHE_SECONDS)
    return response


# ──────────────────────────────────────────────────────────────────────────────
# Route: Ayah landing page
# ──────────────────────────────────────────────────────────────────────────────
@seo_router.get(
    "/ayah/{surah_number}/{ayah_number}",
    response_class=HTMLResponse,
)
async def ayah_landing_page(
    request: Request,
    surah_number: int,
    ayah_number: int,
    db: AsyncSession = Depends(get_db_session),
):
    try:
        ayah = await get_ayah(db, surah_number, ayah_number)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Ayah not found")
    except Exception:
        logger.exception(
            "Failed to fetch ayah %s:%s", surah_number, ayah_number
        )
        raise HTTPException(status_code=500, detail="Internal server error")

    seo = build_ayah_seo(ayah)

    response = templates.TemplateResponse(
        "ayah_landing.html",
        {
            "request": request,
            "ayah": ayah.to_dict(),
            "seo": seo,
        },
    )
    _apply_cache_headers(response, AYAH_CACHE_SECONDS)
    return response


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _apply_cache_headers(response: HTMLResponse, seconds: int) -> None:
    """Attach public cache-control + surrogate-control headers."""
    response.headers["Cache-Control"] = f"public, max-age={seconds}, s-maxage={seconds}"
    response.headers["Surrogate-Control"] = f"max-age={seconds}"
    response.headers["CDN-Cache-Control"] = f"max-age={seconds}"


__all__ = ["seo_router"]