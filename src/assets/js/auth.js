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

export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    /* client-side clear is enough */
  }
  clearToken();
  updateAuthNav();
}

function closeAccountMenus(except) {
  document.querySelectorAll(".nav-account").forEach((el) => {
    if (el === except) return;
    el.classList.remove("is-open");
    const toggle = el.querySelector(".nav-account__toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
}

function prefersHoverNav() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function setAccountExpanded(li, open) {
  li.classList.toggle("is-open", open);
  const toggle = li.querySelector(".nav-account__toggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
}

function ensureLoginLink(host) {
  if (host.matches("a[data-auth-nav]")) {
    host.href = "/login/";
    host.textContent = "Log in";
    host.removeAttribute("aria-expanded");
    host.removeAttribute("aria-haspopup");
    return;
  }

  const li = host.closest("li") || host;
  li.className = "";
  li.innerHTML = "";
  const a = document.createElement("a");
  a.href = "/login/";
  a.setAttribute("data-auth-nav", "");
  a.textContent = "Log in";
  li.appendChild(a);
}

/**
 * @param {Element} host
 * @param {string} [email]
 */
function ensureAccountDropdown(host, email) {
  const li = host.closest("li") || host.parentElement;
  if (!li) return;

  if (li.classList.contains("nav-account")) {
    const emailEl = li.querySelector(".nav-account__email");
    if (emailEl && email) emailEl.textContent = email;
    return;
  }

  li.className = "nav-account";
  li.innerHTML = "";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "nav-account__toggle";
  toggle.setAttribute("data-auth-nav", "");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-haspopup", "true");
  toggle.textContent = "Account";

  const menu = document.createElement("ul");
  menu.className = "nav-account__menu";
  menu.setAttribute("role", "menu");

  const emailItem = document.createElement("li");
  emailItem.className = "nav-account__email-item";
  emailItem.setAttribute("role", "none");
  const emailEl = document.createElement("span");
  emailEl.className = "nav-account__email";
  emailEl.textContent = email || "…";
  emailItem.appendChild(emailEl);

  const item = document.createElement("li");
  item.setAttribute("role", "none");

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "nav-account__logout";
  logoutBtn.setAttribute("role", "menuitem");
  logoutBtn.textContent = "Log Out";

  toggle.addEventListener("click", (event) => {
    // Hover devices open via CSS :hover; tap devices toggle.
    if (prefersHoverNav()) return;
    event.stopPropagation();
    setAccountExpanded(li, !li.classList.contains("is-open"));
    if (li.classList.contains("is-open")) closeAccountMenus(li);
  });

  logoutBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    await logout();
  });

  item.appendChild(logoutBtn);
  menu.append(emailItem, item);
  li.append(toggle, menu);
}

function ensureFooterLogout(host) {
  if (host.matches("a[data-auth-nav]") && host.textContent === "Log out") {
    return;
  }

  const li = host.closest("li") || host.parentElement;
  if (!li) return;

  li.className = "";
  li.innerHTML = "";
  const a = document.createElement("a");
  a.href = "#";
  a.setAttribute("data-auth-nav", "");
  a.textContent = "Log out";
  a.addEventListener("click", async (event) => {
    event.preventDefault();
    await logout();
  });
  li.appendChild(a);
}

export async function updateAuthNav() {
  const hosts = document.querySelectorAll("[data-auth-nav]");
  if (!hosts.length) return;
  const loggedIn = isLoggedIn();

  let email = "";
  if (loggedIn) {
    try {
      const me = await getMe();
      email = me?.email || "";
      if (!me) {
        for (const host of [...hosts]) ensureLoginLink(host);
        return;
      }
    } catch {
      email = "";
    }
  }

  for (const host of [...hosts]) {
    const inHeader = Boolean(host.closest(".site-nav"));
    if (!loggedIn) {
      ensureLoginLink(host);
    } else if (inHeader) {
      ensureAccountDropdown(host, email);
    } else {
      ensureFooterLogout(host);
    }
  }
}

document.addEventListener("click", () => closeAccountMenus());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAccountMenus();
});

updateAuthNav();
