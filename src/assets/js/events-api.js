import { publicKeys } from "./public_keys.js";

const baseUrl = () => publicKeys.ticketTailorProxyUrl.replace(/\/$/, "");

/**
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function apiGet(path) {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail || body.message || detail;
    } catch {
      /* ignore */
    }
    const error = new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail)
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * @param {{ start?: { unix?: number } }} event
 * @param {number} [nowUnix]
 */
export function isUpcoming(event, nowUnix = Math.floor(Date.now() / 1000)) {
  const unix = event?.start?.unix;
  return typeof unix === "number" && unix > nowUnix;
}

/**
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * Allow a conservative subset of markup from Ticket Tailor descriptions.
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function sanitizeDescriptionHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set([
    "P",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "UL",
    "OL",
    "LI",
    "A",
    "H1",
    "H2",
    "H3",
    "H4",
    "BLOCKQUOTE",
    "IMG",
    "FIGURE",
    "FIGCAPTION",
    "HR",
    "SPAN",
    "DIV",
  ]);

  const walk = (node) => {
    const children = [...node.childNodes];
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          walk(node);
          return;
        }
        if (child.tagName === "A") {
          const href = child.getAttribute("href") || "";
          [...child.attributes].forEach((attr) =>
            child.removeAttribute(attr.name)
          );
          if (/^https?:\/\//i.test(href)) {
            child.setAttribute("href", href);
            child.setAttribute("rel", "noopener noreferrer");
            child.setAttribute("target", "_blank");
          }
        } else if (child.tagName === "IMG") {
          const src = child.getAttribute("src") || "";
          [...child.attributes].forEach((attr) =>
            child.removeAttribute(attr.name)
          );
          if (/^https?:\/\//i.test(src)) {
            child.setAttribute("src", src);
            child.setAttribute("alt", "");
            child.setAttribute("loading", "lazy");
          } else {
            child.remove();
            continue;
          }
        } else {
          [...child.attributes].forEach((attr) =>
            child.removeAttribute(attr.name)
          );
        }
        walk(child);
      }
    }
  };

  walk(doc.body);
  return doc.body.innerHTML;
}

/**
 * @param {{ start?: { formatted?: string, iso?: string, date?: string } }} event
 */
export function formatEventWhen(event) {
  if (event?.start?.formatted) return event.start.formatted;
  if (event?.start?.iso) {
    try {
      return new Date(event.start.iso).toLocaleString(undefined, {
        dateStyle: "full",
        timeStyle: "short",
      });
    } catch {
      return event.start.iso;
    }
  }
  return "";
}

/**
 * Calendar date line, e.g. "Saturday, March 28, 2026"
 * @param {{ start?: { iso?: string, date?: string, formatted?: string } }} event
 */
export function formatEventDateLine(event) {
  const iso = event?.start?.iso || event?.start?.date;
  if (iso) {
    try {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      }
    } catch {
      /* fall through */
    }
  }
  return event?.start?.formatted || "";
}

/**
 * Time range, e.g. "6:00 PM – 10:00 PM"
 * @param {{ start?: { iso?: string, time?: string }, end?: { iso?: string, time?: string } }} event
 */
export function formatEventTimeRange(event) {
  const startIso = event?.start?.iso;
  const endIso = event?.end?.iso;
  if (startIso) {
    try {
      const start = new Date(startIso);
      if (!Number.isNaN(start.getTime())) {
        const startText = start.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        });
        if (endIso) {
          const end = new Date(endIso);
          if (!Number.isNaN(end.getTime())) {
            const endText = end.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            });
            return `${startText} – ${endText}`;
          }
        }
        return startText;
      }
    } catch {
      /* fall through */
    }
  }
  const startTime = event?.start?.time;
  const endTime = event?.end?.time;
  if (startTime && endTime) return `${startTime} – ${endTime}`;
  return startTime || "";
}

/**
 * @param {{ venue?: { name?: string, postal_code?: string }, online_event?: string|boolean }} event
 */
export function formatVenueLine(event) {
  if (event?.online_event === "true" || event?.online_event === true) {
    return "Online event";
  }
  const name = event?.venue?.name?.trim();
  const postal = event?.venue?.postal_code?.trim();
  if (name && postal) return `${name}, ${postal}`;
  return name || postal || "";
}

/**
 * @param {HTMLElement} el
 * @param {string} message
 */
export function setStatus(el, message) {
  el.innerHTML = "";
  const p = document.createElement("p");
  p.className = "events-status";
  p.textContent = message;
  el.appendChild(p);
}
