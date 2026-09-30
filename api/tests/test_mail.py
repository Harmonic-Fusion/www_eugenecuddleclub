"""Unit tests for mail composition helpers."""

from __future__ import annotations

from config import Settings
from mail import INSTIGATORS_EMAIL, build_refund_request_email
from ticket_tailor import PublicEvent, PublicEventDate, PublicVenue


def _event(**overrides) -> PublicEvent:
    data = {
        "id": "ev_99",
        "name": "Friday Cuddle",
        "venue": PublicVenue(name="The Bliss Fungalow"),
        "start": PublicEventDate(formatted="1 Jun 2030 19:00"),
        "end": PublicEventDate(formatted="1 Jun 2030 22:00"),
        "url": "https://www.tickettailor.com/events/eugenecuddleclub/ev_99",
        "checkout_url": "https://www.tickettailor.com/checkout/u/ev_99",
    }
    data.update(overrides)
    return PublicEvent(**data)


def test_build_refund_request_email_recipients_and_subject(settings: Settings):
    composed = build_refund_request_email(
        settings,
        event=_event(),
        requester_email="buyer@example.com",
        order_ids=["ord_1", "ord_2"],
    )
    assert composed.to == [INSTIGATORS_EMAIL, "buyer@example.com"]
    assert composed.subject == "Refund Request"
    assert composed.reply_to == "buyer@example.com"
    assert "ord_1, ord_2" in composed.text
    assert "Friday Cuddle" in composed.text
    assert "1 Jun 2030 19:00 – 1 Jun 2030 22:00" in composed.text
    assert "/events/event/?id=ev_99" in composed.text
    assert "buyer@example.com" in composed.html
    assert "<script>" not in composed.html


def test_build_refund_request_email_escapes_html(settings: Settings):
    composed = build_refund_request_email(
        settings,
        event=_event(name='Cuddle <script>alert(1)</script>'),
        requester_email='a&b@"x".com',
        order_ids=[],
    )
    assert "<script>" not in composed.html
    assert "&lt;script&gt;" in composed.html
    assert "(not available)" in composed.text


def test_build_refund_request_email_falls_back_to_iso(settings: Settings):
    composed = build_refund_request_email(
        settings,
        event=_event(
            start=PublicEventDate(iso="2030-06-01T19:00:00-07:00", formatted=None),
            end=PublicEventDate(iso="2030-06-01T22:00:00-07:00", formatted=None),
        ),
        requester_email="buyer@example.com",
        order_ids=["ord_1"],
    )
    assert "2030-06-01T19:00:00-07:00" in composed.text
