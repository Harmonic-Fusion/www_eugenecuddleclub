"""Public read-only proxy between the website and Ticket Tailor, plus auth."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from auth import require_user, router as auth_router
from config import FUNGALOW_MAPS_LABEL, FUNGALOW_MAPS_URL, Settings, get_settings
from db import engine
from email_cache import email_cache_loop
from mail import build_refund_request_email, send_email
from models import User
from ticket_tailor import (
    PublicEvent,
    TicketTailorClient,
    TicketTailorError,
    attendee_names,
    is_public_event,
    is_upcoming,
    serialize_event,
    user_has_ticket,
    user_order_ids,
)

logger = logging.getLogger("ecc.api")

_cors = os.getenv(
    "CORS_ORIGINS",
    "https://eugenecuddleclub.com,http://localhost:8080",
)
_cache_task: asyncio.Task | None = None

# (user_id, event_id) -> unix timestamp of last successful refund request
_refund_request_times: dict[tuple[str, str], float] = {}
_REFUND_COOLDOWN_SECONDS = 10 * 60


def get_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TicketTailorClient:
    return TicketTailorClient(settings)


def fungalow_maps_url(event: PublicEvent) -> str | None:
    name = (event.venue.name or "") if event.venue else ""
    if "fungalow" in name.casefold():
        return FUNGALOW_MAPS_URL
    return None


def _check_refund_rate_limit(user_id: str, event_id: str) -> None:
    key = (user_id, event_id)
    now = time.time()
    last = _refund_request_times.get(key)
    if last is not None and now - last < _REFUND_COOLDOWN_SECONDS:
        raise HTTPException(
            status_code=429,
            detail="A refund request was already sent recently. Please wait a few minutes.",
        )


def _mark_refund_sent(user_id: str, event_id: str) -> None:
    _refund_request_times[(user_id, event_id)] = time.time()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _cache_task
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connectivity ok")
    except Exception:
        logger.exception("Database connectivity check failed")

    settings = get_settings()
    client = TicketTailorClient(settings)
    _cache_task = asyncio.create_task(email_cache_loop(client))
    origins = [o.strip() for o in _cors.split(",") if o.strip()]
    logger.info("API starting; CORS origins=%s", origins)
    yield
    if _cache_task:
        _cache_task.cancel()
        try:
            await _cache_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Eugene Cuddle Club Events API",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth_router)


class EventsListResponse(BaseModel):
    data: list[PublicEvent]


class EventSecureDetails(BaseModel):
    """Authenticated-only fields: exact map link + guest names."""

    venue_maps_url: str | None = None
    venue_maps_label: str | None = None
    attendees: list[str] = []
    confirmed: bool = False
    order_ids: list[str] = []


class RefundRequestResponse(BaseModel):
    status: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/events", response_model=EventsListResponse)
async def list_events(
    client: Annotated[TicketTailorClient, Depends(get_client)],
) -> EventsListResponse:
    """Public event list — no auth, no private venue/attendee data."""
    logger.info("GET /events")
    try:
        raw_events = await client.list_events()
    except TicketTailorError as exc:
        logger.error(
            "Ticket Tailor list_events failed: %s %s",
            exc.status_code,
            exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    public = [serialize_event(raw) for raw in raw_events if is_public_event(raw)]
    now = int(time.time())
    upcoming = sum(1 for e in public if is_upcoming(e, now))
    logger.info(
        "GET /events ok: raw=%s public=%s upcoming=%s past=%s",
        len(raw_events),
        len(public),
        upcoming,
        len(public) - upcoming,
    )
    return EventsListResponse(data=public)


@app.get("/events/{event_id}", response_model=PublicEvent)
async def get_event(
    event_id: str,
    client: Annotated[TicketTailorClient, Depends(get_client)],
) -> PublicEvent:
    """Public event detail — no auth, no private venue/attendee data."""
    logger.info("GET /events/%s", event_id)
    try:
        raw = await client.get_event(event_id)
    except TicketTailorError as exc:
        logger.error(
            "Ticket Tailor get_event %s failed: %s %s",
            event_id,
            exc.status_code,
            exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    if not is_public_event(raw):
        logger.info("GET /events/%s hidden/private/draft → 404", event_id)
        raise HTTPException(status_code=404, detail="Event not found")

    return serialize_event(raw)


@app.get("/events/{event_id}/secure", response_model=EventSecureDetails)
async def get_event_secure(
    event_id: str,
    client: Annotated[TicketTailorClient, Depends(get_client)],
    user: Annotated[User, Depends(require_user)],
) -> EventSecureDetails:
    """Authenticated: Fungalow map link + upcoming attendee names."""
    logger.info("GET /events/%s/secure", event_id)
    try:
        raw = await client.get_event(event_id)
    except TicketTailorError as exc:
        logger.error(
            "Ticket Tailor get_event %s failed: %s %s",
            event_id,
            exc.status_code,
            exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    if not is_public_event(raw):
        raise HTTPException(status_code=404, detail="Event not found")

    event = serialize_event(raw)
    maps_url = fungalow_maps_url(event)
    details = EventSecureDetails(
        venue_maps_url=maps_url,
        venue_maps_label=FUNGALOW_MAPS_LABEL if maps_url else None,
        attendees=[],
        confirmed=False,
    )

    now = int(time.time())
    if not is_upcoming(event, now):
        logger.info("Secure attendees skipped for past event %s", event_id)
        return details

    try:
        tickets = await client.list_issued_tickets(event_id)
    except TicketTailorError as exc:
        logger.error(
            "Ticket Tailor list_issued_tickets %s failed: %s %s",
            event_id,
            exc.status_code,
            exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    details.attendees = attendee_names(tickets)
    details.confirmed = user_has_ticket(tickets, user.email)
    if details.confirmed:
        details.order_ids = user_order_ids(tickets, user.email)
    logger.info(
        "GET /events/%s/secure ok: maps=%s names=%s confirmed=%s orders=%s",
        event_id,
        bool(maps_url),
        len(details.attendees),
        details.confirmed,
        len(details.order_ids),
    )
    return details


@app.post(
    "/events/{event_id}/refund-request",
    response_model=RefundRequestResponse,
)
async def request_event_refund(
    event_id: str,
    client: Annotated[TicketTailorClient, Depends(get_client)],
    user: Annotated[User, Depends(require_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RefundRequestResponse:
    """Authenticated: email instigators + buyer a refund request for this event."""
    logger.info("POST /events/%s/refund-request", event_id)
    _check_refund_rate_limit(str(user.id), event_id)

    try:
        raw = await client.get_event(event_id)
    except TicketTailorError as exc:
        logger.error(
            "Ticket Tailor get_event %s failed: %s %s",
            event_id,
            exc.status_code,
            exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    if not is_public_event(raw):
        raise HTTPException(status_code=404, detail="Event not found")

    event = serialize_event(raw)

    try:
        tickets = await client.list_issued_tickets(event_id)
    except TicketTailorError as exc:
        logger.error(
            "Ticket Tailor list_issued_tickets %s failed: %s %s",
            event_id,
            exc.status_code,
            exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    if not user_has_ticket(tickets, user.email):
        raise HTTPException(
            status_code=403,
            detail="You need a valid ticket for this event to request a refund",
        )

    order_ids = user_order_ids(tickets, user.email)
    composed = build_refund_request_email(
        settings,
        event=event,
        requester_email=user.email,
        order_ids=order_ids,
    )

    try:
        send_email(
            settings,
            to=composed.to,
            subject=composed.subject,
            text=composed.text,
            html_body=composed.html,
            reply_to=composed.reply_to,
            unset_key_log="Dev refund request",
        )
    except Exception:
        logger.exception(
            "Failed to send refund request for event %s user %s",
            event_id,
            user.email,
        )
        raise HTTPException(
            status_code=502, detail="Could not send refund request email"
        ) from None

    _mark_refund_sent(str(user.id), event_id)
    logger.info(
        "POST /events/%s/refund-request ok: orders=%s",
        event_id,
        len(order_ids),
    )
    return RefundRequestResponse(status="sent")
