import {
  apiGet,
  formatEventDateLine,
  formatEventTimeRange,
  formatVenueLine,
  isUpcoming,
  sanitizeDescriptionHtml,
  setStatus,
} from "./events-api.js";

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
 */
function factRow(label, value) {
  const row = document.createElement("div");
  row.className = "event-page__fact";

  const dt = document.createElement("span");
  dt.className = "event-page__fact-label";
  dt.textContent = label;

  const dd = document.createElement("span");
  dd.className = "event-page__fact-value";
  dd.textContent = value;

  row.append(dt, dd);
  return row;
}

/**
 * @param {any} event
 * @param {boolean} canBuy
 * @param {boolean} upcoming
 */
function renderCta(event, canBuy, upcoming) {
  const wrap = document.createElement("div");
  wrap.className = "event-page__cta";

  if (canBuy) {
    const buy = document.createElement("a");
    buy.className = "btn event-page__buy";
    buy.href = event.checkout_url;
    buy.target = "_blank";
    buy.rel = "noopener noreferrer";
    buy.textContent = event.call_to_action || "Buy tickets";
    wrap.appendChild(buy);
    return wrap;
  }

  const note = document.createElement("p");
  note.className = "event-page__status";
  note.textContent = upcoming
    ? "Tickets are not available for this event right now."
    : "This event has passed.";
  wrap.appendChild(note);
  return wrap;
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
    const event = await apiGet(`/events/${encodeURIComponent(id)}`);
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
    if (venueLine) facts.appendChild(factRow("Where", venueLine));

    if (facts.childElementCount) body.appendChild(facts);

    body.appendChild(renderCta(event, canBuy, upcoming));

    const descHtml = sanitizeDescriptionHtml(event.description);
    if (descHtml) {
      const desc = document.createElement("div");
      desc.className = "event-page__description";
      desc.innerHTML = descHtml;
      body.appendChild(desc);
    }

    if (upcoming) {
      const attendeesWrap = document.createElement("section");
      attendeesWrap.className = "event-page__attendees";
      const heading = document.createElement("h2");
      heading.textContent = "Who’s coming";
      attendeesWrap.appendChild(heading);
      const listHost = document.createElement("div");
      setStatus(listHost, "Loading guest list…");
      attendeesWrap.appendChild(listHost);
      body.appendChild(attendeesWrap);

      try {
        const payload = await apiGet(
          `/events/${encodeURIComponent(id)}/attendees`
        );
        const names = payload.data || [];
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
      } catch (err) {
        setStatus(listHost, "Guest list isn’t available right now.");
        console.error(err);
      }
    }

    root.appendChild(body);
    document.title = `${event.name || "Event"} · Eugene Cuddle Club`;
  } catch (err) {
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    setStatus(
      wrap,
      "We couldn’t load this event. It may have been removed, or the events service is temporarily unavailable."
    );
    root.appendChild(wrap);
    console.error(err);
  }
}

init();
