import {
  apiGet,
  formatEventWhen,
  isUpcoming,
  setStatus,
  setUpcomingEmpty,
  stripHtml,
} from "./events-api.js";

const LOG_PREFIX = "[events-list]";

function snippet(description, max = 160) {
  const text = stripHtml(description);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

/**
 * @param {any} event
 * @returns {HTMLElement}
 */
function renderEventItem(event) {
  const link = document.createElement("a");
  link.className = "event-item";
  link.href = `/events/event/?id=${encodeURIComponent(event.id)}`;

  const title = document.createElement("h3");
  title.className = "event-item__title";
  title.textContent = event.name || "Untitled event";

  const meta = document.createElement("p");
  meta.className = "event-item__meta";
  meta.textContent = formatEventWhen(event);

  link.appendChild(title);
  if (meta.textContent) link.appendChild(meta);

  const text = snippet(event.description);
  if (text) {
    const desc = document.createElement("p");
    desc.className = "event-item__desc";
    desc.textContent = text;
    link.appendChild(desc);
  }

  return link;
}

/**
 * @param {HTMLElement} container
 * @param {any[]} events
 * @param {string} emptyMessage
 */
function renderList(container, events, emptyMessage) {
  container.innerHTML = "";
  if (!events.length) {
    setStatus(container, emptyMessage);
    return;
  }
  const list = document.createElement("div");
  list.className = "event-list";
  for (const event of events) {
    list.appendChild(renderEventItem(event));
  }
  container.appendChild(list);
}

const TT_ERROR = "We couldn’t load events. Please try again later.";

/**
 * @param {any[]} events
 */
function splitTicketTailor(events) {
  const now = Math.floor(Date.now() / 1000);
  const upcoming = events
    .filter((e) => isUpcoming(e, now))
    .sort((a, b) => (a.start?.unix || 0) - (b.start?.unix || 0));
  const past = events
    .filter((e) => !isUpcoming(e, now))
    .sort((a, b) => (b.start?.unix || 0) - (a.start?.unix || 0));
  return { upcoming, past, now, total: events.length };
}

/**
 * @param {HTMLElement} upcomingEl
 * @param {any[]} upcoming
 */
async function showUpcoming(upcomingEl, upcoming) {
  upcomingEl.hidden = false;
  if (!upcoming.length) {
    await setUpcomingEmpty(upcomingEl, {
      subscribeUrl: upcomingEl.dataset.subscribeUrl || "",
      email: upcomingEl.dataset.email || "",
    });
  } else {
    renderList(upcomingEl, upcoming, "");
  }
}

/**
 * Past events page and the subscribe confirmation keep the Ticket Tailor list.
 * @param {HTMLElement | null} upcomingEl
 * @param {HTMLElement | null} pastEl
 */
async function initTicketTailorOnly(upcomingEl, pastEl) {
  if (upcomingEl) setStatus(upcomingEl, "Loading events…");
  if (pastEl) setStatus(pastEl, "Loading events…");

  try {
    const payload = await apiGet("/events");
    const events = Array.isArray(payload?.data) ? payload.data : [];
    const split = splitTicketTailor(events);

    console.info(LOG_PREFIX, "loaded", {
      total: split.total,
      upcoming: split.upcoming.length,
      past: split.past.length,
      now: split.now,
    });

    if (upcomingEl) await showUpcoming(upcomingEl, split.upcoming);
    if (pastEl) renderList(pastEl, split.past, "No past events to show yet.");
  } catch (err) {
    console.error(LOG_PREFIX, "failed to load events", err);
    if (upcomingEl) setStatus(upcomingEl, TT_ERROR);
    if (pastEl) setStatus(pastEl, TT_ERROR);
  }
}

async function init() {
  const upcomingEl = document.getElementById("events-upcoming");
  const pastEl = document.getElementById("events-past");
  if (!upcomingEl && !pastEl) return;
  await initTicketTailorOnly(upcomingEl, pastEl);
}

init();
