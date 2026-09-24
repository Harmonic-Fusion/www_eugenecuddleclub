"""Outbound email via Resend (login codes, refund requests)."""

from __future__ import annotations

import html
import logging
from dataclasses import dataclass

import resend

from config import Settings
from ticket_tailor import PublicEvent

logger = logging.getLogger("ecc.mail")

INSTIGATORS_EMAIL = "instigators@eugenecuddleclub.com"
BOX_OFFICE_URL = "https://www.tickettailor.com/events/eugenecuddleclub/"
TT_REFUND_HELP_URL = (
    "https://help.tickettailor.com/en/articles/950960-how-to-cancel-or-refund-an-order"
)


def send_email(
    settings: Settings,
    *,
    to: list[str],
    subject: str,
    text: str,
    html_body: str | None = None,
    reply_to: str | None = None,
    unset_key_log: str | None = None,
) -> None:
    """Send via Resend. If RESEND_API_KEY is unset, log and return (local dev)."""
    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY unset — email not sent. %s to=%s subject=%s\n%s",
            unset_key_log or "Dev mail",
            to,
            subject,
            text,
        )
        return

    resend.api_key = settings.resend_api_key
    payload: dict = {
        "from": settings.resend_from,
        "to": to,
        "subject": subject,
        "text": text,
    }
    if html_body:
        payload["html"] = html_body
    if reply_to:
        payload["reply_to"] = reply_to
    resend.Emails.send(payload)


@dataclass(frozen=True)
class ComposedEmail:
    to: list[str]
    subject: str
    text: str
    html: str
    reply_to: str | None = None


def _event_when_line(event: PublicEvent) -> str:
    start = event.start
    end = event.end
    if start and start.formatted:
        if end and end.formatted and end.formatted != start.formatted:
            return f"{start.formatted} – {end.formatted}"
        return start.formatted
    parts: list[str] = []
    if start and start.iso:
        parts.append(start.iso)
    if end and end.iso and (not start or end.iso != start.iso):
        parts.append(end.iso)
    return " – ".join(parts) if parts else "(not available)"


def build_refund_request_email(
    settings: Settings,
    *,
    event: PublicEvent,
    requester_email: str,
    order_ids: list[str],
) -> ComposedEmail:
    """Compose refund request mail — to/from/subject/body owned by the server."""
    title = event.name or "Event"
    when = _event_when_line(event)
    orders = ", ".join(order_ids) if order_ids else "(not available)"
    site_event_url = (
        f"{settings.site_url.rstrip('/')}/events/event/"
        f"?id={event.id}"
    )
    tt_event_url = event.url or event.checkout_url or BOX_OFFICE_URL

    text = "\n".join(
        [
            "A ticket holder requested a refund.",
            "",
            f"Email: {requester_email}",
            f"Event: {title}",
            f"Date/Time: {when}",
            f"Order IDs: {orders}",
            "",
            "Links:",
            f"- Event page: {site_event_url}",
            f"- Ticket Tailor event: {tt_event_url}",
            f"- Box office: {BOX_OFFICE_URL}",
            f"- How to cancel/refund in Ticket Tailor: {TT_REFUND_HELP_URL}",
            "",
            "Search the Order IDs in the Ticket Tailor Orders dashboard to process the refund.",
        ]
    )

    safe_email = html.escape(requester_email)
    safe_title = html.escape(title)
    safe_when = html.escape(when)
    safe_orders = html.escape(orders)
    safe_site = html.escape(site_event_url)
    safe_tt = html.escape(tt_event_url)
    safe_box = html.escape(BOX_OFFICE_URL)
    safe_help = html.escape(TT_REFUND_HELP_URL)

    html_body = (
        "<p>A ticket holder requested a refund.</p>"
        "<ul>"
        f"<li><strong>Email:</strong> {safe_email}</li>"
        f"<li><strong>Event:</strong> {safe_title}</li>"
        f"<li><strong>Date/Time:</strong> {safe_when}</li>"
        f"<li><strong>Order IDs:</strong> {safe_orders}</li>"
        "</ul>"
        "<p><strong>Links</strong></p>"
        "<ul>"
        f'<li><a href="{safe_site}">Event page</a></li>'
        f'<li><a href="{safe_tt}">Ticket Tailor event</a></li>'
        f'<li><a href="{safe_box}">Box office</a></li>'
        f'<li><a href="{safe_help}">How to cancel/refund in Ticket Tailor</a></li>'
        "</ul>"
        "<p>Search the Order IDs in the Ticket Tailor Orders dashboard "
        "to process the refund.</p>"
    )

    return ComposedEmail(
        to=[INSTIGATORS_EMAIL, requester_email],
        subject="Refund Request",
        text=text,
        html=html_body,
        reply_to=requester_email,
    )
