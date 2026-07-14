"""
SEO Service Layer for Tilawah Programmatic SEO Funnel.

Responsibilities:
- Query SQLAlchemy ORM for Surah / Ayah data.
- Assemble dynamic SEO metadata (title, meta description, canonical).
- Generate JSON-LD Schema.org markup (educational / religious text).
- Build Open Graph + Twitter Card tag bundles.

This module owns NO routing logic and renders NO templates.
It is consumed by `routers/seo_pages.py`.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import NoResultFound

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Static site configuration
# ──────────────────────────────────────────────────────────────────────────────
SITE_NAME: str = "Tilawah"
SITE_URL: str = "https://tilawah.app"
DEFAULT_OG_IMAGE: str = f"{SITE_URL}/static/og/tilawah-default.png"
TWITTER_HANDLE: str = "@tilawah_app"
DEFAULT_DESCRIPTION: str = (
    "Read, listen to, and perfect your Quran recitation with AI-powered voice "
    "analysis and alignment scoring."
)

# Base URL segments used for canonical / OG URLs
SURAH_PATH_TEMPLATE: str = "/surah/{surah_number}"
AYAH_PATH_TEMPLATE: str = "/ayah/{surah_number}/{ayah_number}"


# ──────────────────────────────────────────────────────────────────────────────
# Data transfer objects
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class SurahDTO:
    """Lightweight, serialization-safe representation of a Surah row."""

    surah_number: int
    name_arabic: str
    name_english: str
    name_translation: str
    revelation_type: str
    ayah_count: int
    ayahs: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "surah_number": self.surah_number,
            "name_arabic": self.name_arabic,
            "name_english": self.name_english,
            "name_translation": self.name_translation,
            "revelation_type": self.revelation_type,
            "ayah_count": self.ayah_count,
            "ayahs": self.ayahs,
        }


@dataclass
class AyahDTO:
    """Lightweight, serialization-safe representation of a single Ayah row."""

    surah_number: int
    ayah_number: int
    arabic_text: str
    translation: str
    translator: str
    audio_url: str
    surah_name_english: str
    surah_name_arabic: str
    surah_revelation_type: str
    surah_ayah_count: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "surah_number": self.surah_number,
            "ayah_number": self.ayah_number,
            "arabic_text": self.arabic_text,
            "translation": self.translation,
            "translator": self.translator,
            "audio_url": self.audio_url,
            "surah_name_english": self.surah_name_english,
            "surah_name_arabic": self.surah_name_arabic,
            "surah_revelation_type": self.surah_revelation_type,
            "surah_ayah_count": self.surah_ayah_count,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Database access (raw SQLAlchemy — assumes models live in the host project)
# ──────────────────────────────────────────────────────────────────────────────
# NOTE: The host project must define `Surah` and `Ayah` ORM models.
# We reference attribute names defensively so that minor naming differences
# between projects are easy to reconcile without editing this service.

_SURAH_NUMBER_ATTRS = ("surah_number", "number", "id")
_SURAH_NAME_AR_ATTRS = ("name_arabic", "arabic_name", "name_ar")
_SURAH_NAME_EN_ATTRS = ("name_english", "english_name", "name_en", "name")
_SURAH_TRANS_ATTRS = ("name_translation", "translation", "english_translation", "meaning")
_SURAH_REV_ATTRS = ("revelation_type", "type", "revelation")
_SURAH_AYAH_COUNT_ATTRS = ("ayah_count", "total_ayahs", "num_ayahs", "ayahs")

_AYAH_SURAH_ATTRS = ("surah_number", "surah_id", "surah_no")
_AYAH_NUMBER_ATTRS = ("ayah_number", "number", "number_in_surah")
_AYAH_AR_ATTRS = ("arabic_text", "text_arabic", "text_ar", "arabic")
_AYAH_TRANS_ATTRS = ("translation", "english_text", "text_english", "text_en")
_AYAH_TRANSLATOR_ATTRS = ("translator", "translation_source", "source")
_AYAH_AUDIO_ATTRS = ("audio_url", "audio", "recitation_url")


def _pick(obj: Any, attrs: tuple, default: Any = "") -> Any:
    """Return the first present attribute on *obj* among *attrs*."""
    for attr in attrs:
        if hasattr(obj, attr):
            value = getattr(obj, attr)
            if value is not None:
                return value
    return default


def _row_to_surah_dto(surah_row: Any, ayah_rows: Optional[List[Any]] = None) -> SurahDTO:
    ayah_dtos: List[Dict[str, Any]] = []
    if ayah_rows:
        for ar in ayah_rows:
            ayah_dtos.append(
                {
                    "ayah_number": _pick(ar, _AYAH_NUMBER_ATTRS),
                    "arabic_text": _pick(ar, _AYAH_AR_ATTRS),
                    "translation": _pick(ar, _AYAH_TRANS_ATTRS),
                    "audio_url": _pick(ar, _AYAH_AUDIO_ATTRS),
                }
            )

    return SurahDTO(
        surah_number=int(_pick(surah_row, _SURAH_NUMBER_ATTRS, 0)),
        name_arabic=str(_pick(surah_row, _SURAH_NAME_AR_ATTRS, "")),
        name_english=str(_pick(surah_row, _SURAH_NAME_EN_ATTRS, "")),
        name_translation=str(_pick(surah_row, _SURAH_TRANS_ATTRS, "")),
        revelation_type=str(_pick(surah_row, _SURAH_REV_ATTRS, "")),
        ayah_count=int(_pick(surah_row, _SURAH_AYAH_COUNT_ATTRS, len(ayah_dtos))),
        ayahs=ayah_dtos,
    )


def _row_to_ayah_dto(ayah_row: Any, surah_row: Any) -> AyahDTO:
    return AyahDTO(
        surah_number=int(_pick(ayah_row, _AYAH_SURAH_ATTRS, _pick(surah_row, _SURAH_NUMBER_ATTRS, 0))),
        ayah_number=int(_pick(ayah_row, _AYAH_NUMBER_ATTRS, 0)),
        arabic_text=str(_pick(ayah_row, _AYAH_AR_ATTRS, "")),
        translation=str(_pick(ayah_row, _AYAH_TRANS_ATTRS, "")),
        translator=str(_pick(ayah_row, _AYAH_TRANSLATOR_ATTRS, "Saheeh International")),
        audio_url=str(_pick(ayah_row, _AYAH_AUDIO_ATTRS, "")),
        surah_name_english=str(_pick(surah_row, _SURAH_NAME_EN_ATTRS, "")),
        surah_name_arabic=str(_pick(surah_row, _SURAH_NAME_AR_ATTRS, "")),
        surah_revelation_type=str(_pick(surah_row, _SURAH_REV_ATTRS, "")),
        surah_ayah_count=int(_pick(surah_row, _SURAH_AYAH_COUNT_ATTRS, 0)),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Public service functions
# ──────────────────────────────────────────────────────────────────────────────
async def get_surah(db: AsyncSession, surah_number: int) -> SurahDTO:
    """
    Fetch a full Surah (metadata + all ayahs) from the database.

    Raises:
        NoResultFound: if the surah does not exist.
    """
    # Imported lazily so that host projects that name models differently can
    # still import this module without an ImportError at load time.
    try:
        from app.models import Surah as SurahModel, Ayah as AyahModel  # type: ignore
    except ImportError:
        # Fallback: assume the host exposes models via a different path.
        from app.db.models import Surah as SurahModel, Ayah as AyahModel  # type: ignore

    if not (1 <= surah_number <= 114):
        raise NoResultFound(f"Invalid surah number: {surah_number}")

    surah_result = await db.execute(
        select(SurahModel).where(
            getattr(SurahModel, _SURAH_NUMBER_ATTRS[0]) == surah_number
        )
    )
    surah_row = surah_result.scalars().first()
    if surah_row is None:
        raise NoResultFound(f"Surah {surah_number} not found")

    ayah_result = await db.execute(
        select(AyahModel)
        .where(getattr(AyahModel, _AYAH_SURAH_ATTRS[0]) == surah_number)
        .order_by(getattr(AyahModel, _AYAH_NUMBER_ATTRS[0]))
    )
    ayah_rows = list(ayah_result.scalars().all())

    return _row_to_surah_dto(surah_row, ayah_rows)


async def get_ayah(
    db: AsyncSession, surah_number: int, ayah_number: int
) -> AyahDTO:
    """
    Fetch a single Ayah together with its parent Surah metadata.

    Raises:
        NoResultFound: if either the surah or ayah does not exist.
    """
    try:
        from app.models import Surah as SurahModel, Ayah as AyahModel  # type: ignore
    except ImportError:
        from app.db.models import Surah as SurahModel, Ayah as AyahModel  # type: ignore

    if not (1 <= surah_number <= 114):
        raise NoResultFound(f"Invalid surah number: {surah_number}")

    surah_result = await db.execute(
        select(SurahModel).where(
            getattr(SurahModel, _SURAH_NUMBER_ATTRS[0]) == surah_number
        )
    )
    surah_row = surah_result.scalars().first()
    if surah_row is None:
        raise NoResultFound(f"Surah {surah_number} not found")

    ayah_result = await db.execute(
        select(AyahModel).where(
            getattr(AyahModel, _AYAH_SURAH_ATTRS[0]) == surah_number,
            getattr(AyahModel, _AYAH_NUMBER_ATTRS[0]) == ayah_number,
        )
    )
    ayah_row = ayah_result.scalars().first()
    if ayah_row is None:
        raise NoResultFound(f"Ayah {surah_number}:{ayah_number} not found")

    return _row_to_ayah_dto(ayah_row, surah_row)


# ──────────────────────────────────────────────────────────────────────────────
# SEO metadata assembly
# ──────────────────────────────────────────────────────────────────────────────
def _truncate(text: str, max_len: int = 155) -> str:
    text = " ".join(text.split())  # collapse whitespace
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def _clean(text: str) -> str:
    """Sanitise a string for safe use inside HTML attribute values."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def build_surah_seo(surah: SurahDTO) -> Dict[str, Any]:
    """Return a dict of SEO values consumed by the Jinja2 templates."""
    canonical_url = f"{SITE_URL}{SURAH_PATH_TEMPLATE.format(surah_number=surah.surah_number)}"

    first_translation = (
        surah.ayahs[0]["translation"] if surah.ayahs else ""
    )
    description = _truncate(
        f"Read and listen to Surah {surah.name_english} ({surah.name_arabic}), "
        f"a {surah.revelation_type} chapter with {surah.ayah_count} verses. "
        f"{first_translation}",
        max_len=155,
    )

    title = (
        f"Surah {surah.name_english} ({surah.name_arabic}) — Full Text, Audio & "
        f"Translation | {SITE_NAME}"
    )

    return {
        "title": _clean(title),
        "description": _clean(description),
        "canonical": canonical_url,
        "og_type": "website",
        "og_title": _clean(title),
        "og_description": _clean(description),
        "og_image": DEFAULT_OG_IMAGE,
        "og_url": canonical_url,
        "twitter_card": "summary_large_image",
        "twitter_site": TWITTER_HANDLE,
        "twitter_title": _clean(title),
        "twitter_description": _clean(description),
        "twitter_image": DEFAULT_OG_IMAGE,
        "json_ld": json.dumps(_surah_jsonld(surah, canonical_url), ensure_ascii=False),
    }


def build_ayah_seo(ayah: AyahDTO) -> Dict[str, Any]:
    """Return a dict of SEO values consumed by the Jinja2 templates."""
    canonical_url = (
        f"{SITE_URL}{AYAH_PATH_TEMPLATE.format(surah_number=ayah.surah_number, ayah_number=ayah.ayah_number)}"
    )

    description = _truncate(
        f"Surah {ayah.surah_name_english}, Verse {ayah.ayah_number}: "
        f"{ayah.translation}",
        max_len=155,
    )

    title = (
        f"Surah {ayah.surah_name_english} Verse {ayah.ayah_number} - Audio & "
        f"Translation | {SITE_NAME}"
    )

    return {
        "title": _clean(title),
        "description": _clean(description),
        "canonical": canonical_url,
        "og_type": "article",
        "og_title": _clean(title),
        "og_description": _clean(description),
        "og_image": DEFAULT_OG_IMAGE,
        "og_url": canonical_url,
        "twitter_card": "summary_large_image",
        "twitter_site": TWITTER_HANDLE,
        "twitter_title": _clean(title),
        "twitter_description": _clean(description),
        "twitter_image": DEFAULT_OG_IMAGE,
        "json_ld": json.dumps(_ayah_jsonld(ayah, canonical_url), ensure_ascii=False),
    }


# ──────────────────────────────────────────────────────────────────────────────
# JSON-LD Schema.org markup
# ──────────────────────────────────────────────────────────────────────────────
def _surah_jsonld(surah: SurahDTO, canonical_url: str) -> Dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": f"Surah {surah.name_english} ({surah.name_arabic})",
        "description": f"Full text, audio recitation, and English translation of "
        f"Surah {surah.name_english}, a {surah.revelation_type} chapter of the "
        f"Holy Quran containing {surah.ayah_count} verses.",
        "inLanguage": ["ar", "en"],
        "isPartOf": {
            "@type": "Book",
            "name": "The Holy Quran",
            "author": {"@type": "Person", "name": "Allah"},
        },
        "publisher": {
            "@type": "Organization",
            "name": SITE_NAME,
            "url": SITE_URL,
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical_url},
        "about": {
            "@type": "Thing",
            "name": f"Surah {surah.name_english}",
            "sameAs": f"https://en.wikipedia.org/wiki/Surah_{surah.name_english}",
        },
        "datePublished": datetime.utcnow().isoformat() + "Z",
        "dateModified": datetime.utcnow().isoformat() + "Z",
        "keywords": [
            f"Surah {surah.name_english}",
            surah.name_arabic,
            "Quran",
            "audio recitation",
            "English translation",
            surah.revelation_type,
        ],
    }


def _ayah_jsonld(ayah: AyahDTO, canonical_url: str) -> Dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": (
            f"Surah {ayah.surah_name_english} Verse {ayah.ayah_number} — "
            f"Audio & Translation"
        ),
        "description": ayah.translation,
        "inLanguage": ["ar", "en"],
        "isPartOf": {
            "@type": "Article",
            "headline": f"Surah {ayah.surah_name_english}",
            "url": f"{SITE_URL}{SURAH_PATH_TEMPLATE.format(surah_number=ayah.surah_number)}",
        },
        "publisher": {
            "@type": "Organization",
            "name": SITE_NAME,
            "url": SITE_URL,
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical_url},
        "text": ayah.translation,
        "audio": {
            "@type": "AudioObject",
            "contentUrl": ayah.audio_url,
            "encodingFormat": "audio/mpeg",
            "inLanguage": "ar",
        },
        "datePublished": datetime.utcnow().isoformat() + "Z",
        "dateModified": datetime.utcnow().isoformat() + "Z",
        "keywords": [
            f"Surah {ayah.surah_name_english}",
            f"Verse {ayah.ayah_number}",
            "Quran",
            "audio",
            "translation",
            ayah.surah_revelation_type,
        ],
    }


__all__ = [
    "SurahDTO",
    "AyahDTO",
    "get_surah",
    "get_ayah",
    "build_surah_seo",
    "build_ayah_seo",
]