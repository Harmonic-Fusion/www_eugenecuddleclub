"""Public read-only proxy between the website and Ticket Tailor."""

from __future__ import annotations

import os
import time
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import Settings, get_settings
from ticket_tailor import (
    PublicEvent,
    TicketTailorClient,
    TicketTailorError,
    attendee_names,
    is_public_event,
    is_upcoming,
    serialize_event,
)

app = FastAPI(title="Eugene Cuddle Club Events API", version="1.0.0")

_cors = os.getenv(
    "CORS_ORIGINS",
    "https://eugenecuddleclub.com,http://localhost:8080",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TicketTailorClient:
    return TicketTailorClient(settings)


class EventsListResponse(BaseModel):
    data: list[PublicEvent]


class AttendeesResponse(BaseModel):
    data: list[str]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/events", response_model=EventsListResponse)
async def list_events(
    client: Annotated[TicketTailorClient, Depends(get_client)],
) -> EventsListResponse:
    try:
        raw_events = await client.list_events()
    except TicketTailorError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    return EventsListResponse(
        data=[
            serialize_event(raw)
            for raw in raw_events
            if is_public_event(raw)
        ]
    )


@app.get("/events/{event_id}", response_model=PublicEvent)
async def get_event(
    event_id: str,
    client: Annotated[TicketTailorClient, Depends(get_client)],
) -> PublicEvent:
    try:
        raw = await client.get_event(event_id)
    except TicketTailorError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    if not is_public_event(raw):
        raise HTTPException(status_code=404, detail="Event not found")

    return serialize_event(raw)


@app.get("/events/{event_id}/attendees", response_model=AttendeesResponse)
async def get_attendees(
    event_id: str,
    client: Annotated[TicketTailorClient, Depends(get_client)],
) -> AttendeesResponse:
    try:
        raw = await client.get_event(event_id)
    except TicketTailorError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    if not is_public_event(raw):
        raise HTTPException(status_code=404, detail="Event not found")

    event = serialize_event(raw)
    now = int(time.time())
    if not is_upcoming(event, now):
        raise HTTPException(
            status_code=403,
            detail="Attendee lists are only available for upcoming events",
        )

    try:
        tickets = await client.list_issued_tickets(event_id)
    except TicketTailorError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message
        ) from exc

    return AttendeesResponse(data=attendee_names(tickets))
