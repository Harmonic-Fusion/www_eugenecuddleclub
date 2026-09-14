"""HTTP client for the Ticket Tailor API with Pydantic deserialization."""

from __future__ import annotations

import base64
import logging
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ConfigDict, Field

from config import Settings

logger = logging.getLogger("ecc.tickettailor")

T = TypeVar("T", bound=BaseModel)


class TicketTailorError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class TTModel(BaseModel):
    """Base for Ticket Tailor payloads — ignore unknown fields."""

    model_config = ConfigDict(extra="ignore")


# --- Upstream Ticket Tailor shapes -----------------------------------------


class EventDate(TTModel):
    date: str | None = None
    formatted: str | None = None
    iso: str | None = None
    time: str | None = None
    timezone: str | None = None
    unix: int | None = None


class Venue(TTModel):
    name: str | None = None
    postal_code: str | None = None
    country: str | None = None


class EventImages(TTModel):
    header: str | None = None
    thumbnail: str | None = None


class TicketTailorEvent(TTModel):
    id: str
    name: str | None = None
    description: str | None = None
    start: EventDate | None = None
    end: EventDate | None = None
    venue: Venue | None = None
    images: EventImages | None = None
    checkout_url: str | None = None
    status: str | None = None
    tickets_available: str | bool | None = None
    unavailable: str | bool | None = None
    hidden: str | bool | None = None
    private: str | bool | None = None
    call_to_action: str | None = None
    url: str | None = None
    online_event: str | bool | None = None


class IssuedTicket(TTModel):
    """Attendee ticket. Email/phone may exist upstream but are never exposed."""

    id: str | None = None
    full_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    status: str | None = None


class PaginatedResponse(TTModel):
    data: list[dict[str, Any]] = Field(default_factory=list)


# --- Public API response shapes (no buyer PII) -----------------------------


class PublicEventDate(BaseModel):
    date: str | None = None
    formatted: str | None = None
    iso: str | None = None
    time: str | None = None
    timezone: str | None = None
    unix: int | None = None

    @classmethod
    def from_tt(cls, raw: EventDate | None) -> PublicEventDate | None:
        if raw is None:
            return None
        return cls.model_validate(raw.model_dump())


class PublicVenue(BaseModel):
    name: str | None = None
    postal_code: str | None = None
    country: str | None = None


class PublicEventImages(BaseModel):
    header: str | None = None
    thumbnail: str | None = None


class PublicEvent(BaseModel):
    id: str
    name: str | None = None
    description: str | None = None
    start: PublicEventDate | None = None
    end: PublicEventDate | None = None
    venue: PublicVenue
    images: PublicEventImages | None = None
    checkout_url: str | None = None
    status: str | None = None
    tickets_available: str | bool | None = None
    unavailable: str | bool | None = None
    hidden: str | bool | None = None
    private: str | bool | None = None
    call_to_action: str | None = None
    url: str | None = None
    online_event: str | bool | None = None

    @classmethod
    def from_tt(cls, event: TicketTailorEvent) -> PublicEvent:
        venue = event.venue
        images = event.images
        return cls(
            id=event.id,
            name=event.name,
            description=event.description,
            start=PublicEventDate.from_tt(event.start),
            end=PublicEventDate.from_tt(event.end),
            venue=PublicVenue(
                name=venue.name if venue else None,
                postal_code=venue.postal_code if venue else None,
                country=venue.country if venue else None,
            ),
            images=(
                PublicEventImages(
                    header=images.header if images else None,
                    thumbnail=images.thumbnail if images else None,
                )
                if images
                else None
            ),
            checkout_url=event.checkout_url,
            status=event.status,
            tickets_available=event.tickets_available,
            unavailable=event.unavailable,
            hidden=event.hidden,
            private=event.private,
            call_to_action=event.call_to_action,
            url=event.url,
            online_event=event.online_event,
        )


# --- Client ----------------------------------------------------------------


class TicketTailorClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ticket_tailor_base_url.rstrip("/")
        token = base64.b64encode(
            f"{settings.ticket_tailor_api_key}:".encode()
        ).decode()
        self._headers = {
            "Accept": "application/json",
            "Authorization": f"Basic {token}",
        }

    async def _get_json(
        self, path: str, params: dict[str, Any] | None = None
    ) -> Any:
        url = f"{self._base_url}{path}"
        logger.info("Ticket Tailor GET %s params=%s", path, params or {})
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                url, headers=self._headers, params=params
            )
        if response.status_code >= 400:
            try:
                body = response.json()
                message = body.get("message") or response.text
            except Exception:
                message = response.text or "Ticket Tailor request failed"
            logger.error(
                "Ticket Tailor %s → %s: %s",
                path,
                response.status_code,
                str(message)[:300],
            )
            raise TicketTailorError(response.status_code, str(message))
        logger.info("Ticket Tailor %s → %s", path, response.status_code)
        return response.json()

    async def list_all(
        self,
        path: str,
        item_model: type[T],
        params: dict[str, Any] | None = None,
    ) -> list[T]:
        """Paginate a list endpoint and validate each item as item_model."""
        items: list[T] = []
        query: dict[str, Any] = {"limit": 100}
        if params:
            query.update(params)

        while True:
            payload = PaginatedResponse.model_validate(
                await self._get_json(path, query)
            )
            page = [item_model.model_validate(row) for row in payload.data]
            items.extend(page)
            if len(page) < 100:
                break
            last_id = getattr(page[-1], "id", None)
            if not last_id:
                break
            query["starting_after"] = last_id

        logger.info("Ticket Tailor list %s total=%s", path, len(items))
        return items

    async def get_event(self, event_id: str) -> TicketTailorEvent:
        raw = await self._get_json(f"/events/{event_id}")
        return TicketTailorEvent.model_validate(raw)

    async def list_events(self) -> list[TicketTailorEvent]:
        return await self.list_all("/events", TicketTailorEvent)

    async def list_issued_tickets(self, event_id: str) -> list[IssuedTicket]:
        return await self.list_all(
            "/issued_tickets",
            IssuedTicket,
            {"event_id": event_id, "status": "valid"},
        )


def _flag_true(value: str | bool | None) -> bool:
    if value is True:
        return True
    if isinstance(value, str) and value.lower() == "true":
        return True
    return False


def is_public_event(event: TicketTailorEvent) -> bool:
    if event.status == "draft":
        return False
    if _flag_true(event.hidden) or _flag_true(event.private):
        return False
    return True


def is_upcoming(event: PublicEvent | TicketTailorEvent, now_unix: int) -> bool:
    start = event.start
    if start is None or start.unix is None:
        return False
    return int(start.unix) > now_unix


def serialize_event(event: TicketTailorEvent) -> PublicEvent:
    """Public-safe event payload (no buyer PII)."""
    return PublicEvent.from_tt(event)


def attendee_names(tickets: list[IssuedTicket]) -> list[str]:
    names: set[str] = set()
    for ticket in tickets:
        full = (ticket.full_name or "").strip()
        if not full:
            first = (ticket.first_name or "").strip()
            last = (ticket.last_name or "").strip()
            full = f"{first} {last}".strip()
        if full:
            names.add(full)
    return sorted(names, key=str.casefold)
