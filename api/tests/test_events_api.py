"""Unit tests for main.py helpers and event HTTP endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from config import FUNGALOW_MAPS_LABEL, FUNGALOW_MAPS_URL
from main import (
    _REFUND_COOLDOWN_SECONDS,
    _check_refund_rate_limit,
    _mark_refund_sent,
    fungalow_maps_url,
)
from ticket_tailor import (
    IssuedTicket,
    PublicEvent,
    PublicVenue,
    TicketTailorError,
    TicketTailorEvent,
)


def test_fungalow_maps_url_only_for_fungalow_venue():
    fungalow = PublicEvent(
        id="1",
        venue=PublicVenue(name="The Bliss Fungalow"),
    )
    other = PublicEvent(id="2", venue=PublicVenue(name="Community Center"))
    none_venue = PublicEvent(id="3", venue=PublicVenue(name=None))

    assert fungalow_maps_url(fungalow) == FUNGALOW_MAPS_URL
    assert fungalow_maps_url(other) is None
    assert fungalow_maps_url(none_venue) is None


def test_refund_rate_limit(monkeypatch):
    import main

    main._refund_request_times.clear()
    now = 1_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: now)

    _mark_refund_sent("user-1", "ev_1")
    with pytest.raises(HTTPException) as exc:
        _check_refund_rate_limit("user-1", "ev_1")
    assert exc.value.status_code == 429

    # Different user/event is fine
    _check_refund_rate_limit("user-2", "ev_1")
    _check_refund_rate_limit("user-1", "ev_2")

    monkeypatch.setattr(
        main.time, "time", lambda: now + _REFUND_COOLDOWN_SECONDS + 1
    )
    _check_refund_rate_limit("user-1", "ev_1")


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_list_events_filters_private(
    client, mock_tt_client, raw_public_event
):
    private = {**raw_public_event, "id": "ev_private", "private": True}
    draft = {**raw_public_event, "id": "ev_draft", "status": "draft"}
    mock_tt_client.list_events = AsyncMock(
        return_value=[
            TicketTailorEvent.model_validate(raw_public_event),
            TicketTailorEvent.model_validate(private),
            TicketTailorEvent.model_validate(draft),
        ]
    )

    resp = client.get("/events")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["id"] == "ev_public"
    assert data[0]["venue"]["name"] == "The Bliss Fungalow"


def test_list_events_propagates_ticket_tailor_error(client, mock_tt_client):
    mock_tt_client.list_events = AsyncMock(
        side_effect=TicketTailorError(502, "upstream down")
    )
    resp = client.get("/events")
    assert resp.status_code == 502
    assert resp.json()["detail"] == "upstream down"


def test_get_event_404_for_hidden(client, mock_tt_client, raw_public_event):
    hidden = {**raw_public_event, "hidden": "true"}
    mock_tt_client.get_event = AsyncMock(
        return_value=TicketTailorEvent.model_validate(hidden)
    )
    resp = client.get("/events/ev_public")
    assert resp.status_code == 404


def test_get_event_ok(client, mock_tt_client, raw_public_event):
    mock_tt_client.get_event = AsyncMock(
        return_value=TicketTailorEvent.model_validate(raw_public_event)
    )
    resp = client.get("/events/ev_public")
    assert resp.status_code == 200
    assert resp.json()["id"] == "ev_public"
    assert resp.json()["name"] == "Friday Cuddle"


def test_get_event_secure_requires_auth(client, mock_tt_client, raw_public_event):
    mock_tt_client.get_event = AsyncMock(
        return_value=TicketTailorEvent.model_validate(raw_public_event)
    )
    resp = client.get("/events/ev_public/secure")
    assert resp.status_code == 401


def test_get_event_secure_returns_maps_and_attendees(
    authed_client, mock_tt_client, raw_public_event
):
    mock_tt_client.get_event = AsyncMock(
        return_value=TicketTailorEvent.model_validate(raw_public_event)
    )
    mock_tt_client.list_issued_tickets = AsyncMock(
        return_value=[
            IssuedTicket(
                id="t1",
                full_name="Ada Lovelace",
                email="buyer@example.com",
                order_id="ord_1",
            ),
            IssuedTicket(
                id="t2",
                full_name="Grace Hopper",
                email="other@example.com",
                order_id="ord_2",
            ),
        ]
    )

    resp = authed_client.get("/events/ev_public/secure")
    assert resp.status_code == 200
    body = resp.json()
    assert body["venue_maps_url"] == FUNGALOW_MAPS_URL
    assert body["venue_maps_label"] == FUNGALOW_MAPS_LABEL
    assert body["attendees"] == ["Ada Lovelace", "Grace Hopper"]
    assert body["confirmed"] is True
    assert body["order_ids"] == ["ord_1"]


def test_get_event_secure_skips_attendees_for_past_event(
    authed_client, mock_tt_client, raw_public_event
):
    past = {
        **raw_public_event,
        "start": {**raw_public_event["start"], "unix": 1_000_000},
    }
    mock_tt_client.get_event = AsyncMock(
        return_value=TicketTailorEvent.model_validate(past)
    )

    resp = authed_client.get("/events/ev_public/secure")
    assert resp.status_code == 200
    body = resp.json()
    assert body["attendees"] == []
    assert body["confirmed"] is False
    mock_tt_client.list_issued_tickets.assert_not_called()


def test_refund_request_requires_ticket(
    authed_client, mock_tt_client, raw_public_event
):
    mock_tt_client.get_event = AsyncMock(
        return_value=TicketTailorEvent.model_validate(raw_public_event)
    )
    mock_tt_client.list_issued_tickets = AsyncMock(
        return_value=[
            IssuedTicket(
                id="t1",
                email="someone-else@example.com",
                order_id="ord_9",
            )
        ]
    )

    resp = authed_client.post("/events/ev_public/refund-request")
    assert resp.status_code == 403


def test_refund_request_sends_email(
    authed_client, mock_tt_client, raw_public_event
):
    mock_tt_client.get_event = AsyncMock(
        return_value=TicketTailorEvent.model_validate(raw_public_event)
    )
    mock_tt_client.list_issued_tickets = AsyncMock(
        return_value=[
            IssuedTicket(
                id="t1",
                email="buyer@example.com",
                order_id="ord_1",
            )
        ]
    )

    with patch("main.send_email") as send_email:
        resp = authed_client.post("/events/ev_public/refund-request")
        assert resp.status_code == 200
        assert resp.json() == {"status": "sent"}
        send_email.assert_called_once()
        kwargs = send_email.call_args.kwargs
        assert "buyer@example.com" in kwargs["to"]
        assert kwargs["subject"] == "Refund Request"

        # Rate limit kicks in on immediate retry
        resp2 = authed_client.post("/events/ev_public/refund-request")
        assert resp2.status_code == 429


def test_logout(client):
    resp = client.post("/auth/logout")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
