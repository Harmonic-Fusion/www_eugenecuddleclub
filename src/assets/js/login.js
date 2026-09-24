import {
  apiFetch,
  clearToken,
  getToken,
  loginUrl,
  setToken,
  updateAuthNav,
} from "./auth.js";
import { publicKeys } from "./public_keys.js";

const LOG_PREFIX = "[login]";

function params() {
  return new URLSearchParams(window.location.search);
}

function nextPath() {
  const next = params().get("next") || "/events/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/events/";
  return next;
}

function setMessage(el, text, kind = "status") {
  el.innerHTML = "";
  const p = document.createElement("p");
  p.className = kind === "error" ? "form-note auth-panel__error" : "events-status";
  p.textContent = text;
  el.appendChild(p);
}

function finishLogin(token) {
  setToken(token);
  updateAuthNav();
  window.location.replace(nextPath());
}

/**
 * @param {HTMLElement} root
 */
function renderEmailStep(root) {
  root.innerHTML = "";

  const form = document.createElement("form");
  form.className = "auth-form";
  form.noValidate = true;

  const label = document.createElement("label");
  label.className = "auth-form__label";
  label.htmlFor = "login-email";
  label.textContent = "Email used for your ticket";

  const input = document.createElement("input");
  input.className = "auth-form__input";
  input.id = "login-email";
  input.name = "email";
  input.type = "email";
  input.autocomplete = "email";
  input.required = true;
  input.placeholder = "you@example.com";

  const actions = document.createElement("div");
  actions.className = "btn-row";

  const submit = document.createElement("button");
  submit.className = "btn";
  submit.type = "submit";
  submit.textContent = "Continue";

  actions.appendChild(submit);
  const feedback = document.createElement("div");
  feedback.className = "auth-form__feedback";

  form.append(label, input, actions, feedback);
  root.appendChild(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!email) return;
    submit.disabled = true;
    setMessage(feedback, "Checking…");
    try {
      const result = await apiFetch("/auth/check-email", {
        method: "POST",
        body: { email },
        auth: false,
      });
      if (!result.allowed) {
        setMessage(
          feedback,
          "We couldn’t find a ticket purchase with that email. Use the address from your Ticket Tailor order.",
          "error"
        );
        submit.disabled = false;
        return;
      }
      renderMethodStep(root, email, result);
    } catch (err) {
      console.error(LOG_PREFIX, "check-email failed", err);
      setMessage(
        feedback,
        err.message || "Something went wrong. Try again.",
        "error"
      );
      submit.disabled = false;
    }
  });
}

/**
 * @param {HTMLElement} root
 * @param {string} email
 * @param {{ method?: string, code_allowed?: boolean }} result
 */
function renderMethodStep(root, email, result) {
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "auth-form";

  const intro = document.createElement("p");
  intro.textContent = `Continue as ${email}`;
  wrap.appendChild(intro);

  const actions = document.createElement("div");
  actions.className = "btn-row btn-row--stack";

  if (result.method === "google") {
    const google = document.createElement("a");
    google.className = "btn";
    google.href = `${publicKeys.ticketTailorProxyUrl.replace(/\/$/, "")}/auth/google/start?email=${encodeURIComponent(email)}`;
    google.textContent = "Continue with Google";
    actions.appendChild(google);
  }

  if (result.method === "email" || result.code_allowed) {
    const codeBtn = document.createElement("button");
    codeBtn.className =
      result.method === "google" ? "btn btn--ghost" : "btn";
    codeBtn.type = "button";
    codeBtn.textContent =
      result.method === "google" ? "Email me a code instead" : "Email me a code";
    codeBtn.addEventListener("click", () => startEmailCode(root, email));
    actions.appendChild(codeBtn);
  }

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.type = "button";
  back.textContent = "Use a different email";
  back.addEventListener("click", () => renderEmailStep(root));
  actions.appendChild(back);

  const feedback = document.createElement("div");
  feedback.className = "auth-form__feedback";

  wrap.append(actions, feedback);
  root.appendChild(wrap);
}

/**
 * @param {HTMLElement} root
 * @param {string} email
 */
async function startEmailCode(root, email) {
  root.innerHTML = "";
  const feedback = document.createElement("div");
  setMessage(feedback, "Sending a code…");
  root.appendChild(feedback);

  try {
    await apiFetch("/auth/email/start", {
      method: "POST",
      body: { email },
      auth: false,
    });
    renderCodeStep(root, email);
  } catch (err) {
    console.error(LOG_PREFIX, "email/start failed", err);
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "auth-form";
    const fb = document.createElement("div");
    setMessage(fb, err.message || "Could not send email.", "error");
    const back = document.createElement("button");
    back.className = "btn";
    back.type = "button";
    back.textContent = "Back";
    back.addEventListener("click", () => renderEmailStep(root));
    wrap.append(fb, back);
    root.appendChild(wrap);
  }
}

/**
 * @param {HTMLElement} root
 * @param {string} email
 */
function renderCodeStep(root, email) {
  root.innerHTML = "";

  const form = document.createElement("form");
  form.className = "auth-form";

  const note = document.createElement("p");
  note.textContent = `We sent a code to ${email}. Enter it below, or use the link in the email.`;

  const label = document.createElement("label");
  label.className = "auth-form__label";
  label.htmlFor = "login-code";
  label.textContent = "Login code";

  const input = document.createElement("input");
  input.className = "auth-form__input";
  input.id = "login-code";
  input.name = "code";
  input.inputMode = "numeric";
  input.autocomplete = "one-time-code";
  input.required = true;
  input.placeholder = "123456";

  const actions = document.createElement("div");
  actions.className = "btn-row";

  const submit = document.createElement("button");
  submit.className = "btn";
  submit.type = "submit";
  submit.textContent = "Sign in";

  const resend = document.createElement("button");
  resend.className = "btn btn--ghost";
  resend.type = "button";
  resend.textContent = "Resend code";
  resend.addEventListener("click", () => startEmailCode(root, email));

  actions.append(submit, resend);
  const feedback = document.createElement("div");
  feedback.className = "auth-form__feedback";

  form.append(note, label, input, actions, feedback);
  root.appendChild(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const payload = await apiFetch("/auth/email/verify", {
        method: "POST",
        body: { email, code: input.value.trim() },
        auth: false,
      });
      finishLogin(payload.access_token);
    } catch (err) {
      console.error(LOG_PREFIX, "verify failed", err);
      setMessage(feedback, err.message || "Invalid code.", "error");
      submit.disabled = false;
    }
  });
}

async function init() {
  const root = document.getElementById("login-app");
  if (!root) return;

  const q = params();
  const error = q.get("error");
  if (error) {
    const messages = {
      google: "Google sign-in didn’t complete. Try again.",
      email_mismatch:
        "That Google account didn’t match the email you entered.",
    };
    setMessage(root, messages[error] || "Sign-in failed. Try again.", "error");
    const retry = document.createElement("button");
    retry.className = "btn";
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => {
      window.history.replaceState({}, "", "/login/");
      renderEmailStep(root);
    });
    root.appendChild(retry);
    return;
  }

  const accessToken = q.get("access_token");
  if (accessToken) {
    finishLogin(accessToken);
    return;
  }

  const magic = q.get("token");
  if (magic) {
    setMessage(root, "Signing you in…");
    try {
      const payload = await apiFetch("/auth/email/verify", {
        method: "POST",
        body: { token: magic },
        auth: false,
      });
      finishLogin(payload.access_token);
    } catch (err) {
      console.error(LOG_PREFIX, "magic link failed", err);
      setMessage(root, err.message || "That link is invalid or expired.", "error");
      const retry = document.createElement("button");
      retry.className = "btn";
      retry.type = "button";
      retry.textContent = "Request a new code";
      retry.addEventListener("click", () => renderEmailStep(root));
      root.appendChild(retry);
    }
    return;
  }

  if (getToken()) {
    window.location.replace(nextPath());
    return;
  }

  renderEmailStep(root);
}

init();
