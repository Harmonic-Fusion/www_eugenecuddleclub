import { publicKeys } from "./public_keys.js";

const LOG_PREFIX = "[tortillanet]";
const FALLBACK_TIMEZONE = "America/Los_Angeles";
const CACHE_KEY = "ecc.tortillanet.events";
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const EVENT_FIELDS =
  "title,slug,starts_at,ends_at,timezone,location_name,visibility,cancelled_at,archived_at";

function configured() {
  const url = (publicKeys.tortillanetSupabaseUrl || "").trim();
  const key = (publicKeys.tortillanetSupabaseAnonKey || "").trim();
  return Boolean(url && key);
}

function communitySlug() {
  return (publicKeys.tortillanetCommunitySlug || "eugene-cuddle-club").replace(
    /^\/+|\/+$/g,
    ""
  );
}

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function resolveTimezone(name) {
  if (name) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: name });
      return name;
    } catch {
      console.warn(LOG_PREFIX, "unknown timezone", name);
    }
  }
  return FALLBACK_TIMEZONE;
}

/**
 * @param {Date | string | number} value
 * @param {string} timeZone
 * @returns {string}
 */
export function calendarDay(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

/**
 * Offset of `timeZone` from UTC at `utcMs`, in milliseconds.
 * @param {number} utcMs
 * @param {string} timeZone
 */
function tzOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const pick = (type) =>
    Number(parts.find((part) => part.type === type)?.value);
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    hour,
    pick("minute"),
    pick("second")
  );
  return asUtc - utcMs;
}

/**
 * Wall-clock time in `timeZone` as a UTC timestamp.
 * @param {string} day YYYY-MM-DD
 * @param {string} timeZone
 */
function endOfDayMs(day, timeZone) {
  const [year, month, date] = day.split("-").map(Number);
  // Resolve 23:59:59 on the second, then add 999ms. Mixing milliseconds
  // into the timezone offset math rolls the instant past midnight.
  const utcGuess = Date.UTC(year, month - 1, date, 23, 59, 59);
  const offset = tzOffsetMs(utcGuess, timeZone);
  let corrected = utcGuess - offset;
  const offset2 = tzOffsetMs(corrected, timeZone);
  if (offset2 !== offset) corrected = utcGuess - offset2;
  return corrected + 999;
}

/**
 * When the event is over. With ends_at, that instant. Otherwise the end of
 * the start calendar day in the event timezone.
 * @param {any} event
 * @returns {number}
 */
export function eventDeadlineMs(event) {
  if (event?.ends_at) {
    const end = new Date(event.ends_at).getTime();
    if (!Number.isNaN(end)) return end;
  }
  const timeZone = resolveTimezone(event?.timezone);
  const start = new Date(event?.starts_at);
  if (Number.isNaN(start.getTime())) return NaN;
  const day = calendarDay(start, timeZone);
  if (!day) return start.getTime();
  return endOfDayMs(day, timeZone);
}

/**
 * @param {any} event
 * @param {number} [nowMs]
 */
export function isPast(event, nowMs = Date.now()) {
  const deadline = eventDeadlineMs(event);
  if (Number.isNaN(deadline)) return true;
  return deadline < nowMs;
}

/**
 * @param {any[]} rows
 * @param {number} [nowMs]
 * @returns {any[]}
 */
export function selectFutureEvents(rows, nowMs = Date.now()) {
  const slug = communitySlug();
  return rows
    .filter(
      (event) =>
        event &&
        event.slug &&
        !event.cancelled_at &&
        !event.archived_at &&
        !isPast(event, nowMs)
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    )
    .map((event) => {
      const timeZone = resolveTimezone(event.timezone);
      const location = (event.location_name || "").trim();
      const isPrivate = event.visibility === "members";
      const inviteCode = isPrivate ? "cz4iwnpr" : null;
      const url = inviteCode
        ? `https://tortillanet.app/${slug}/${event.slug}?code=${inviteCode}`
        : `https://tortillanet.app/${slug}/${event.slug}`;
      return {
        title: (event.title || "").trim() || "Untitled event",
        slug: event.slug,
        starts_at: event.starts_at,
        ends_at: event.ends_at || null,
        timezone: timeZone,
        location_name: location || null,
        visibility: event.visibility || null,
        members_only: isPrivate,
        url,
      };
    });
}

/**
 * @param {string} path
 * @param {Record<string, string>} params
 */
async function supabaseGet(path, params) {
  const base = publicKeys.tortillanetSupabaseUrl.replace(/\/$/, "");
  const key = publicKeys.tortillanetSupabaseAnonKey;
  const url = new URL(`${base}/rest/v1${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`TortillaNet ${path} returned ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function readCache() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.slug !== communitySlug() ||
      typeof parsed.at !== "number" ||
      Date.now() - parsed.at > CACHE_MS ||
      !Array.isArray(parsed.rows)
    ) {
      return null;
    }
    return parsed.rows;
  } catch {
    return null;
  }
}

/**
 * @param {any[]} rows
 */
function writeCache(rows) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), slug: communitySlug(), rows })
    );
  } catch {
    /* private mode or a full quota — the list still renders */
  }
}

async function fetchRows() {
  const cached = readCache();
  if (cached) {
    console.info(LOG_PREFIX, "cache hit", cached.length);
    return cached;
  }
  const slug = communitySlug();
  const communities = await supabaseGet("/communities", {
    slug: `eq.${slug}`,
    select: "id",
    limit: "1",
  });
  const communityId = Array.isArray(communities) ? communities[0]?.id : null;
  if (!communityId) {
    console.warn(LOG_PREFIX, "community not found", slug);
    return [];
  }
  const rows = await supabaseGet("/events", {
    community_id: `eq.${communityId}`,
    select: EVENT_FIELDS,
  });
  if (!Array.isArray(rows)) {
    throw new Error("TortillaNet events response was not a list");
  }
  writeCache(rows);
  console.info(LOG_PREFIX, "fetched", rows.length);
  return rows;
}

/**
 * Future TortillaNet events. An empty list when the keys are blank.
 * Throws when a configured request fails, so the page can leave Ticket Tailor alone.
 * @param {number} [nowMs]
 */
export async function fetchTortillaEvents(nowMs = Date.now()) {
  if (!configured()) {
    console.info(LOG_PREFIX, "not configured");
    return [];
  }
  const rows = await fetchRows();
  return selectFutureEvents(rows, nowMs);
}
