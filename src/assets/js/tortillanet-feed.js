const FEED_URL =
  "https://tortillanet.app/embed/eugene-cuddle-club/events.json";
const LOG_PREFIX = "[tortillanet-feed]";

/**
 * @param {any} event
 * @returns {boolean}
 */
function isCancelled(event) {
  const status = String(event?.status || "").toLowerCase();
  return status === "cancelled" || status === "canceled";
}

/**
 * @param {any} event
 * @returns {HTMLElement}
 */
function renderItem(event) {
  const link = document.createElement("a");
  link.className = "event-item";
  link.href = event.links.web;
  link.target = "_blank";
  link.rel = "noopener";

  const title = document.createElement("h3");
  title.className = "event-item__title";
  title.textContent = event.title || "Untitled event";

  const meta = document.createElement("p");
  meta.className = "event-item__meta";
  meta.textContent = event.when || "";

  link.appendChild(title);
  if (meta.textContent) link.appendChild(meta);

  const venue = (event.venueName || "").trim();
  if (venue) {
    const place = document.createElement("p");
    place.className = "event-item__desc";
    place.textContent = venue;
    link.appendChild(place);
  }

  return link;
}

/**
 * Hide the fold when there is nothing to show so an empty section stays quiet.
 * @param {HTMLElement} host
 */
function hideSection(host) {
  host.hidden = true;
  const fold = host.closest("details");
  if (fold) fold.hidden = true;
}

async function init() {
  const host = document.getElementById("events-tortillanet");
  if (!host) return;

  const list = host.querySelector(".events-tortillanet__list");
  if (!list) return;

  try {
    const response = await fetch(FEED_URL, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`TortillaNet feed returned ${response.status}`);
    }
    const payload = await response.json();
    const events = (Array.isArray(payload?.events) ? payload.events : []).filter(
      (event) => event && event.links?.web && !isCancelled(event)
    );

    if (!events.length) {
      hideSection(host);
      return;
    }

    list.replaceChildren(...events.map(renderItem));
    host.hidden = false;
    const fold = host.closest("details");
    if (fold) fold.hidden = false;
  } catch (err) {
    console.error(LOG_PREFIX, "failed to load events", err);
    hideSection(host);
  }
}

init();
