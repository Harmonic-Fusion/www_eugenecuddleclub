"""Sync Ticket Tailor buyer emails into the local eligibility cache."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db import SessionLocal
from models import TicketBuyerEmail
from ticket_tailor import TicketTailorClient, TicketTailorError

logger = logging.getLogger("ecc.email_cache")

_sync_lock = asyncio.Lock()
_last_sync_at: float = 0.0
_last_miss_refresh_at: float = 0.0
SYNC_INTERVAL_SECONDS = 60 * 60
MISS_REFRESH_COOLDOWN_SECONDS = 60


def normalize_email(email: str) -> str:
    return email.strip().lower()


def is_test_login_email(email: str) -> bool:
    """Allow emails whose local part contains +test (e.g. you+test@gmail.com)."""
    normalized = normalize_email(email)
    if "@" not in normalized:
        return False
    local, _domain = normalized.rsplit("@", 1)
    return "+test" in local


async def email_is_eligible(session: AsyncSession, email: str) -> bool:
    normalized = normalize_email(email)
    if not normalized:
        return False
    if is_test_login_email(normalized):
        return True
    result = await session.execute(
        select(TicketBuyerEmail).where(TicketBuyerEmail.email == normalized)
    )
    return result.scalar_one_or_none() is not None


async def upsert_emails(session: AsyncSession, emails: list[str]) -> int:
    now = datetime.now(timezone.utc)
    unique = sorted({normalize_email(e) for e in emails if e and e.strip()})
    if not unique:
        return 0

    stmt = insert(TicketBuyerEmail).values(
        [
            {
                "email": email,
                "first_seen_at": now,
                "last_seen_at": now,
            }
            for email in unique
        ]
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[TicketBuyerEmail.email],
        set_={"last_seen_at": now},
    )
    await session.execute(stmt)
    await session.commit()
    return len(unique)


async def sync_ticket_buyer_emails(client: TicketTailorClient) -> int:
    """Fetch issued-ticket emails from Ticket Tailor and upsert the cache."""
    global _last_sync_at
    async with _sync_lock:
        try:
            emails = await client.list_all_issued_ticket_emails()
        except TicketTailorError as exc:
            logger.error(
                "Email cache sync failed: %s %s",
                exc.status_code,
                exc.message,
            )
            raise

        async with SessionLocal() as session:
            count = await upsert_emails(session, emails)

        _last_sync_at = time.monotonic()
        logger.info("Email cache sync ok: upserted=%s", count)
        return count


async def maybe_refresh_on_miss(client: TicketTailorClient) -> bool:
    """Rate-limited refresh when a login email misses the cache."""
    global _last_miss_refresh_at
    now = time.monotonic()
    if now - _last_miss_refresh_at < MISS_REFRESH_COOLDOWN_SECONDS:
        return False
    _last_miss_refresh_at = now
    try:
        await sync_ticket_buyer_emails(client)
        return True
    except TicketTailorError:
        return False


async def email_cache_loop(client: TicketTailorClient) -> None:
    """Startup sync + hourly refresh."""
    while True:
        try:
            await sync_ticket_buyer_emails(client)
        except Exception:
            logger.exception("Periodic email cache sync failed")
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
