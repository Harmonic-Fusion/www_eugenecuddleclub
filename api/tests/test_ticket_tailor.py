"""Unit tests for Ticket Tailor pure helpers."""

from __future__ import annotations

from ticket_tailor import (
    IssuedTicket,
    PublicEvent,
    PublicEventDate,
    PublicVenue,
    TicketTailorEvent,
    attendee_names,
    is_public_event,
    is_upcoming,
    serialize_event,
    user_has_ticket,
    user_order_ids,
)


def _tt_event(**overrides) -> TicketTailorEvent:
    base = {
        "id": "ev_1",
        "name": "Test",
        "status": "published",
        "hidden": False,
        "private": False,
        "venue": {"name": "Somewhere", "postal_code": "97401", "country": "US"},
        "start": {"unix": 2_000_000_000},
    }
    base.update(overrides)
    return TicketTailorEvent.model_validate(base)


def test_is_public_event_rejects_draft():
    assert is_public_event(_tt_event(status="draft")) is False


def test_is_public_event_rejects_hidden_and_private_flags():
    assert is_public_event(_tt_event(hidden=True)) is False
    assert is_public_event(_tt_event(hidden="true")) is False
    assert is_public_event(_tt_event(private=True)) is False
    assert is_public_event(_tt_event(private="TRUE")) is False


def test_is_public_event_allows_published():
    assert is_public_event(_tt_event()) is True


def test_is_upcoming_requires_start_unix():
    public = PublicEvent(
        id="ev_1",
        venue=PublicVenue(name="X"),
        start=None,
    )
    assert is_upcoming(public, now_unix=1) is False

    public = PublicEvent(
        id="ev_1",
        venue=PublicVenue(name="X"),
        start=PublicEventDate(unix=100),
    )
    assert is_upcoming(public, now_unix=100) is False
    assert is_upcoming(public, now_unix=99) is True


def test_serialize_event_copies_venue_without_maps():
    event = serialize_event(
        _tt_event(venue={"name": "The Bliss Fungalow", "postal_code": "97405"})
    )
    assert event.venue.name == "The Bliss Fungalow"
    assert event.id == "ev_1"
    assert not hasattr(event.venue, "maps_url")


def test_attendee_names_prefers_full_name_and_dedupes():
    tickets = [
        IssuedTicket(id="1", full_name="Ada Lovelace", email="a@x.com"),
        IssuedTicket(id="2", first_name="Grace", last_name="Hopper", email="g@x.com"),
        IssuedTicket(id="3", full_name="Ada Lovelace", email="a2@x.com"),
        IssuedTicket(id="4", full_name="  ", first_name="", last_name="", email="e@x.com"),
    ]
    assert attendee_names(tickets) == ["Ada Lovelace", "Grace Hopper"]


def test_user_has_ticket_case_insensitive():
    tickets = [
        IssuedTicket(id="1", email="Buyer@Example.COM", status="valid"),
        IssuedTicket(id="2", email="other@example.com", status="valid"),
    ]
    assert user_has_ticket(tickets, "  buyer@example.com ") is True
    assert user_has_ticket(tickets, "nobody@example.com") is False
    assert user_has_ticket(tickets, "") is False


def test_user_order_ids_unique_preserving_order():
    tickets = [
        IssuedTicket(id="1", email="a@x.com", order_id="ord_1"),
        IssuedTicket(id="2", email="b@x.com", order_id="ord_other"),
        IssuedTicket(id="3", email="a@x.com", order_id="ord_1"),
        IssuedTicket(id="4", email="a@x.com", order_id="ord_2"),
        IssuedTicket(id="5", email="a@x.com", order_id=""),
    ]
    assert user_order_ids(tickets, "A@X.COM") == ["ord_1", "ord_2"]
