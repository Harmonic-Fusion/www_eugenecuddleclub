import { publicKeys } from "./public_keys.js";

const LOG_PREFIX = "[events-api]";

const baseUrl = () => publicKeys.ticketTailorProxyUrl.replace(/\/$/, "");

/**
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function apiGet(path) {
  const url = `${baseUrl()}${path}`;
  console.info(LOG_PREFIX, "GET", url);
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    console.error(LOG_PREFIX, "network error", { url, err });
    const error = new Error(
      `Could not reach events API at ${url}. Is the API running?`
    );
    error.cause = err;
    error.status = 0;
    throw error;
  }

  if (!response.ok) {
    let detail = response.statusText;
    let bodyText = "";
    try {
      bodyText = await response.text();
      const body = JSON.parse(bodyText);
      detail = body.detail || body.message || detail;
    } catch {
      if (bodyText) detail = bodyText.slice(0, 200);
    }
    console.error(LOG_PREFIX, "HTTP error", {
      url,
      status: response.status,
      detail,
    });
    const error = new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail)
    );
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const count = Array.isArray(payload?.data) ? payload.data.length : undefined;
  console.info(LOG_PREFIX, "ok", { url, status: response.status, count });
  return payload;
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

/**
 * Probe whether the subscribe landing page is reachable.
 * Uses no-cors so a missing ACAO header does not look like a failure;
 * a resolved opaque response means the host answered.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function canLoadSubscribeUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch (err) {
    console.warn(LOG_PREFIX, "subscribe URL unreachable", { url, err });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve the best mailing-list CTA (subscribe page, mailto, or contact).
 * @param {{ subscribeUrl?: string, email?: string }} [options]
 * @returns {Promise<{ href: string, text: string, external: boolean }>}
 */
export async function resolveSubscribeLink(options = {}) {
  const subscribeUrl = (options.subscribeUrl || "").trim();
  const email = (options.email || "").trim();

  if (subscribeUrl && (await canLoadSubscribeUrl(subscribeUrl))) {
    return {
      href: subscribeUrl,
      text: "Join the mailing list",
      external: true,
    };
  }
  if (email) {
    return {
      href: `mailto:${email}?subject=${encodeURIComponent(
        "Cuddle Club mailing list"
      )}`,
      text: "Email us to join the mailing list",
      external: false,
    };
  }
  return {
    href: "/contact/",
    text: "Contact us to join the mailing list",
    external: false,
  };
}

/**
 * Apply a resolved mailing-list link to an existing anchor.
 * @param {HTMLAnchorElement} link
 * @param {{ subscribeUrl?: string, email?: string, text?: string }} [options]
 */
export async function applySubscribeLink(link, options = {}) {
  const resolved = await resolveSubscribeLink(options);
  link.href = resolved.href;
  link.textContent = options.text || resolved.text;
  if (resolved.external) {
    link.target = "_blank";
    link.rel = "noopener";
  } else {
    link.removeAttribute("target");
    link.removeAttribute("rel");
  }
  return resolved;
}

/**
 * Empty state when there are no upcoming events.
 * @param {HTMLElement} el
 * @param {{ subscribeUrl?: string, email?: string }} [options]
 */
export async function setUpcomingEmpty(el, options = {}) {
  el.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "events-empty";

  const sub = document.createElement("p");
  sub.className = "events-empty__cta";
  sub.appendChild(
    document.createTextNode("No upcoming events right now. ")
  );

  const link = document.createElement("a");
  await applySubscribeLink(link, options);
  sub.appendChild(link);

  wrap.appendChild(sub);
  el.appendChild(wrap);
}
