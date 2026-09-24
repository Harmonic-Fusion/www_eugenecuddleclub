import {
  apiGet,
  formatEventDateLine,
  formatEventTimeRange,
  formatVenueLine,
  isUpcoming,
  sanitizeDescriptionHtml,
  setStatus,
} from "./events-api.js";
import { isLoggedIn, loginUrl } from "./auth.js";

const REFUND_MAILTO =
  "mailto:instigators@eugenecuddleclub.com?subject=Ticket%20refund%20request";

function ticketsAvailable(event) {
  const available = event.tickets_available;
  if (available === "false" || available === false) return false;
  if (event.unavailable === "true" || event.unavailable === true) return false;
  if (event.status === "sales_closed") return false;
  return Boolean(event.checkout_url);
}

/**
 * @param {string} label
 * @param {string} value
 * @param {{ href?: string }} [options]
 */
function factRow(label, value, options = {}) {
  const row = document.createElement("div");
  row.className = "event-page__fact";

  const dt = document.createElement("span");
  dt.className = "event-page__fact-label";
  dt.textContent = label;

  const dd = document.createElement("span");
  dd.className = "event-page__fact-value";
  if (options.href) {
    const link = document.createElement("a");
    link.href = options.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = value;
    dd.appendChild(link);
  } else {
    dd.textContent = value;
  }

  row.append(dt, dd);
  return row;
}

/**
 * Inline Ticket Tailor checkout widget for this event.
 * @see https://cdn.tickettailor.com/js/widgets/min/widget.js
 * @param {string} widgetUrl
 */
function renderTicketWidget(widgetUrl) {
  // TT's widget.js only matches parent.className === "tt-widget" (exact).
  const host = document.createElement("div");
  host.className = "event-page__widget";

  const widget = document.createElement("div");
  widget.className = "tt-widget";

  const script = document.createElement("script");
  script.src = "https://cdn.tickettailor.com/js/widgets/min/widget.js";
  script.async = true;
  script.setAttribute("data-url", widgetUrl);
  script.setAttribute("data-type", "inline");
  script.setAttribute("data-inline-minimal", "true");
  script.setAttribute("data-inline-show-logo", "false");
  script.setAttribute("data-inline-bg-fill", "true");
  script.setAttribute("data-inline-inherit-ref-from-url-param", "");
  script.setAttribute("data-inline-ref", "ecc_event_page");
  widget.appendChild(script);
  host.appendChild(widget);
  return host;
}

/**
 * Banner shown when the signed-in user already has a valid ticket.
 * @param {any} event
 */
function renderConfirmedBanner(event) {
  const banner = document.createElement("div");
  banner.className = "event-page__confirmed";
  banner.setAttribute("role", "status");

  const title = document.createElement("p");
  title.className = "event-page__confirmed-title";
  title.textContent = "You're confirmed!";
  banner.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "btn-row";

  const buyMore = document.createElement("a");
  buyMore.className = "btn";
  buyMore.href =
    event.checkout_url ||
    event.url ||
    "https://www.tickettailor.com/events/eugenecuddleclub/";
  buyMore.target = "_blank";
  buyMore.rel = "noopener noreferrer";
  buyMore.textContent = "Purchase More Tickets";
  actions.appendChild(buyMore);

  const refund = document.createElement("a");
  refund.className = "btn btn--ghost";
  refund.href = REFUND_MAILTO;
  refund.textContent = "Request Refund";
  actions.appendChild(refund);

  banner.appendChild(actions);
  return banner;
}

/**
 * @param {HTMLElement} wrap
 * @param {any} event
 * @param {{ canBuy: boolean, upcoming: boolean, confirmed?: boolean }} options
 */
function fillCta(wrap, event, { canBuy, upcoming, confirmed = false }) {
  wrap.replaceChildren();

  if (confirmed && upcoming) {
    wrap.appendChild(renderConfirmedBanner(event));
    return;
  }

  if (canBuy) {
    const widgetUrl = event.checkout_url || event.url;
    wrap.appendChild(renderTicketWidget(widgetUrl));
    return;
  }

  const note = document.createElement("p");
  note.className = "event-page__status";
  note.textContent = upcoming
    ? "Tickets are not available for this event right now."
    : "This event has passed.";
  wrap.appendChild(note);
}

async function init() {
  const root = document.getElementById("event-detail");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    setStatus(wrap, "Missing event id. Pick an event from the events page.");
    root.appendChild(wrap);
    return;
  }

  try {
    const event = await apiGet(`/events/${encodeURIComponent(id)}`, {
      auth: false,
    });
    root.innerHTML = "";

    const upcoming = isUpcoming(event);
    const canBuy = upcoming && ticketsAvailable(event);
    const headerImage =
      event.images?.header || event.images?.thumbnail || "";

    const top = document.createElement("div");
    top.className = "event-page__top wrap";

    const back = document.createElement("p");
    back.className = "event-page__back";
    const backLink = document.createElement("a");
    backLink.href = "/events/";
    backLink.textContent = "← All events";
    back.appendChild(backLink);
    top.appendChild(back);
    root.appendChild(top);

    const hero = document.createElement("div");
    hero.className = "event-page__hero";
    if (headerImage) {
      const img = document.createElement("img");
      img.src = headerImage;
      img.alt = "";
      img.decoding = "async";
      hero.appendChild(img);
    } else {
      hero.classList.add("event-page__hero--empty");
    }
    root.appendChild(hero);

    const body = document.createElement("div");
    body.className = "event-page__body wrap";

    const title = document.createElement("h1");
    title.className = "event-page__title";
    title.textContent = event.name || "Event";
    body.appendChild(title);

    const facts = document.createElement("div");
    facts.className = "event-page__facts";

    const dateLine = formatEventDateLine(event);
    const timeLine = formatEventTimeRange(event);
    if (dateLine) facts.appendChild(factRow("When", dateLine));
    if (timeLine) facts.appendChild(factRow("Time", timeLine));

    const venueLine = formatVenueLine(event);
    let whereRow = null;
    if (venueLine) {
      whereRow = factRow("Where", venueLine);
      facts.appendChild(whereRow);
    }

    if (facts.childElementCount) body.appendChild(facts);

    const cta = document.createElement("div");
    cta.className = "event-page__cta";
    // Defer checkout widget until we know if the signed-in user is confirmed.
    if (isLoggedIn() && upcoming && canBuy) {
      setStatus(cta, "Checking your ticket…");
    } else {
      fillCta(cta, event, { canBuy, upcoming, confirmed: false });
    }
    body.appendChild(cta);

    const descHtml = sanitizeDescriptionHtml(event.description);
    if (descHtml) {
      const desc = document.createElement("div");
      desc.className = "event-page__description";
      desc.innerHTML = descHtml;
      body.appendChild(desc);
    }

    let listHost = null;
    if (upcoming) {
      const attendeesWrap = document.createElement("section");
      attendeesWrap.className = "event-page__attendees";
      const heading = document.createElement("h2");
      heading.textContent = "Who’s coming";
      attendeesWrap.appendChild(heading);
      listHost = document.createElement("div");
      attendeesWrap.appendChild(listHost);
      body.appendChild(attendeesWrap);

      if (!isLoggedIn()) {
        const note = document.createElement("p");
        note.className = "events-status";
        note.appendChild(
          document.createTextNode(
            "Sign in to see who’s coming. Anyone who’s been to an event can view the guest list for upcoming nights."
          )
        );
        const link = document.createElement("a");
        link.href = loginUrl(
          `/events/event/?id=${encodeURIComponent(id)}`
        );
        link.textContent = "Log in";
        note.appendChild(link);
        listHost.appendChild(note);
      } else {
        setStatus(listHost, "Loading guest list…");
      }
    }

    root.appendChild(body);
    document.title = `${event.name || "Event"} · Eugene Cuddle Club`;

    if (isLoggedIn()) {
      try {
        const secure = await apiGet(
          `/events/${encodeURIComponent(id)}/secure`
        );
        if (secure.venue_maps_url && whereRow) {
          const label =
            secure.venue_maps_label || "2296 Cleveland, Eugene, Oregon";
          const replacement = factRow("Where", label, {
            href: secure.venue_maps_url,
          });
          whereRow.replaceWith(replacement);
        }
        fillCta(cta, event, {
          canBuy,
          upcoming,
          confirmed: Boolean(secure.confirmed),
        });
        if (upcoming && listHost) {
          const names = secure.attendees || [];
          listHost.innerHTML = "";
          if (!names.length) {
            setStatus(listHost, "No one on the list yet — be the first.");
          } else {
            const ul = document.createElement("ul");
            ul.className = "attendee-list";
            for (const name of names) {
              const li = document.createElement("li");
              li.textContent = name;
              ul.appendChild(li);
            }
            listHost.appendChild(ul);
          }
        }
      } catch (err) {
        console.error("[event-detail]", "secure details failed", { id, err });
        if (upcoming && canBuy) {
          fillCta(cta, event, { canBuy, upcoming, confirmed: false });
        }
        if (upcoming && listHost && isLoggedIn()) {
          setStatus(listHost, "Guest list isn’t available right now.");
        }
      }
    }
  } catch (err) {
    console.error("[event-detail]", "failed", { id, err });
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    setStatus(
      wrap,
      "We couldn’t load this event. It may have been removed, or the events service is temporarily unavailable."
    );
    root.appendChild(wrap);
  }
}

init();
