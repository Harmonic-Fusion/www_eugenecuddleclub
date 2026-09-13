import {
  apiGet,
  formatEventWhen,
  isUpcoming,
  setStatus,
  stripHtml,
} from "./events-api.js";

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
  const article = document.createElement("article");
  article.className = "event-item";

  const title = document.createElement("h3");
  title.className = "event-item__title";
  const link = document.createElement("a");
  link.href = `/events/event/?id=${encodeURIComponent(event.id)}`;
  link.textContent = event.name || "Untitled event";
  title.appendChild(link);

  const meta = document.createElement("p");
  meta.className = "event-item__meta";
  meta.textContent = formatEventWhen(event);

  article.appendChild(title);
  if (meta.textContent) article.appendChild(meta);

  const text = snippet(event.description);
  if (text) {
    const desc = document.createElement("p");
    desc.className = "event-item__desc";
    desc.textContent = text;
    article.appendChild(desc);
  }

  return article;
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

async function init() {
  const upcomingEl = document.getElementById("events-upcoming");
  const pastEl = document.getElementById("events-past");
  if (!upcomingEl && !pastEl) return;

  if (upcomingEl) setStatus(upcomingEl, "Loading events…");
  if (pastEl) setStatus(pastEl, "Loading events…");

  try {
    const payload = await apiGet("/events");
    const events = payload.data || [];
    const now = Math.floor(Date.now() / 1000);

    if (upcomingEl) {
      const upcoming = events
        .filter((e) => isUpcoming(e, now))
        .sort((a, b) => (a.start?.unix || 0) - (b.start?.unix || 0));
      renderList(
        upcomingEl,
        upcoming,
        "No upcoming events right now. Check back soon."
      );
    }

    if (pastEl) {
      const past = events
        .filter((e) => !isUpcoming(e, now))
        .sort((a, b) => (b.start?.unix || 0) - (a.start?.unix || 0));
      renderList(pastEl, past, "No past events to show yet.");
    }
  } catch (err) {
    const message =
      "We couldn’t load events. Please try again later, or book via the box office link below.";
    if (upcomingEl) setStatus(upcomingEl, message);
    if (pastEl) setStatus(pastEl, message);
    console.error(err);
  }
}

init();
