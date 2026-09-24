import { publicKeys } from "./public_keys.js";

const TOKEN_KEY = "ecc_access_token";

const baseUrl = () => publicKeys.ticketTailorProxyUrl.replace(/\/$/, "");

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function loginUrl(next) {
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  const q = params.toString();
  return q ? `/login/?${q}` : "/login/";
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: any, auth?: boolean }} [options]
 */
export async function apiFetch(path, options = {}) {
  const { method = "GET", body, auth = true } = options;
  const headers = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const url = `${baseUrl()}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
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
      const parsed = JSON.parse(bodyText);
      detail = parsed.detail || parsed.message || detail;
    } catch {
      if (bodyText) detail = bodyText.slice(0, 200);
    }
    const error = new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail)
    );
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

export async function getMe() {
  if (!getToken()) return null;
  try {
    return await apiFetch("/auth/me");
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      return null;
    }
    throw err;
  }
}

export function updateAuthNav() {
  const links = document.querySelectorAll("[data-auth-nav]");
  if (!links.length) return;
  const loggedIn = isLoggedIn();
  for (const link of links) {
    if (loggedIn) {
      link.href = "/account/";
      link.textContent = "Account";
    } else {
      link.href = "/login/";
      link.textContent = "Log in";
    }
  }
}

updateAuthNav();
