import {
  apiGet,
  formatEventWhen,
  isUpcoming,
  setStatus,
  setUpcomingEmpty,
  stripHtml,
} from "./events-api.js";
import { calendarDay, fetchTortillaEvents } from "./tortillanet.js";

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

const PACIFIC = "America/Los_Angeles";
const TT_ERROR = "We couldn’t load events. Please try again later.";

/**
 * @param {any} event
 */
function formatTortillaWhen(event) {
  const timeZone = event?.timezone || PACIFIC;
  const start = new Date(event?.starts_at);
  if (Number.isNaN(start.getTime())) return "";

  const dateOpts = {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  };
  const timeOpts = { hour: "numeric", minute: "2-digit", timeZone };
  const date = start.toLocaleDateString("en-US", dateOpts);
  const startTime = start.toLocaleTimeString("en-US", timeOpts);
  let zone = "";
  try {
    zone =
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "short",
      })
        .formatToParts(start)
        .find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    zone = "";
  }
  const zoneSuffix = zone ? ` ${zone}` : "";
  const end = event?.ends_at ? new Date(event.ends_at) : null;
  if (!end || Number.isNaN(end.getTime())) {
    return `${date} at ${startTime}${zoneSuffix}`;
  }
  const endTime = end.toLocaleTimeString("en-US", timeOpts);
  if (calendarDay(start, timeZone) === calendarDay(end, timeZone)) {
    return `${date}, ${startTime} – ${endTime}${zoneSuffix}`;
  }
  const endDate = end.toLocaleDateString("en-US", dateOpts);
  return `${date} at ${startTime} – ${endDate} at ${endTime}${zoneSuffix}`;
}

/**
 * @param {any} event
 * @returns {HTMLElement}
 */
function renderTortillaItem(event) {
  const link = document.createElement("a");
  link.className = "event-item";
  link.href = event.url;
  link.target = "_blank";
  link.rel = "noopener";

  const title = document.createElement("h3");
  title.className = "event-item__title";
  title.textContent = event.title || "Untitled event";

  const meta = document.createElement("p");
  meta.className = "event-item__meta";
  meta.textContent = formatTortillaWhen(event);

  link.appendChild(title);
  if (meta.textContent) link.appendChild(meta);

  if (event.location_name) {
    const place = document.createElement("p");
    place.className = "event-item__desc";
    place.textContent = event.location_name;
    link.appendChild(place);
  }

  if (event.members_only || event.visibility === "members") {
    const badge = document.createElement("p");
    badge.className = "event-item__badge";
    badge.textContent = "Members only";
    link.appendChild(badge);
  }

  return link;
}

/**
 * @param {HTMLElement} container
 * @param {any[]} events
 */
function renderTortillaList(container, events) {
  const list = container.querySelector(".events-tortillanet__list");
  if (!list) return;
  list.replaceChildren(...events.map(renderTortillaItem));
  container.open = false;
  container.hidden = false;
}

/**
 * @param {HTMLElement | null} el
 */
function hideTortilla(el) {
  if (!el) return;
  el.hidden = true;
  el.open = false;
  const list = el.querySelector(".events-tortillanet__list");
  if (list) list.replaceChildren();
}

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
 * Past events page and the subscribe confirmation keep the original list.
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

/**
 * /events: Ticket Tailor and TortillaNet together.
 * @param {HTMLElement | null} upcomingEl
 * @param {HTMLElement | null} pastEl
 * @param {HTMLElement} tortillaEl
 * @param {HTMLElement | null} bannerEl
 */
async function initWithTortilla(upcomingEl, pastEl, tortillaEl, bannerEl) {
  if (upcomingEl) setStatus(upcomingEl, "Loading events…");
  if (pastEl) setStatus(pastEl, "Loading events…");
  if (bannerEl) bannerEl.hidden = true;
  hideTortilla(tortillaEl);

  const [ttResult, tnResult] = await Promise.allSettled([
    apiGet("/events"),
    fetchTortillaEvents(),
  ]);

  let upcoming = [];
  const ttFailed = ttResult.status !== "fulfilled";

  if (!ttFailed) {
    const events = Array.isArray(ttResult.value?.data) ? ttResult.value.data : [];
    const split = splitTicketTailor(events);
    upcoming = split.upcoming;
    console.info(LOG_PREFIX, "loaded", {
      total: split.total,
      upcoming: split.upcoming.length,
      past: split.past.length,
      now: split.now,
    });
    if (pastEl) renderList(pastEl, split.past, "No past events to show yet.");
  } else {
    console.error(LOG_PREFIX, "failed to load events", ttResult.reason);
    if (pastEl) setStatus(pastEl, TT_ERROR);
  }

  let tortilla = [];
  const tnFailed = tnResult.status !== "fulfilled";
  if (tnFailed) {
    console.error(
      LOG_PREFIX,
      "failed to load TortillaNet events",
      tnResult.reason
    );
  } else {
    tortilla = Array.isArray(tnResult.value) ? tnResult.value : [];
  }

  if (bannerEl) bannerEl.hidden = upcoming.length === 0;

  if (upcomingEl) {
    if (ttFailed) {
      upcomingEl.hidden = false;
      setStatus(upcomingEl, TT_ERROR);
    } else {
      await showUpcoming(upcomingEl, upcoming);
    }
  }

  if (!tnFailed && tortilla.length) {
    renderTortillaList(tortillaEl, tortilla);
  } else {
    hideTortilla(tortillaEl);
  }
}

async function init() {
  const upcomingEl = document.getElementById("events-upcoming");
  const pastEl = document.getElementById("events-past");
  const tortillaEl = document.getElementById("events-tortillanet");
  const bannerEl = document.getElementById("events-tt-banner");
  if (!upcomingEl && !pastEl && !tortillaEl) return;

  if (tortillaEl) {
    await initWithTortilla(upcomingEl, pastEl, tortillaEl, bannerEl);
    return;
  }
  await initTicketTailorOnly(upcomingEl, pastEl);
}

init();
