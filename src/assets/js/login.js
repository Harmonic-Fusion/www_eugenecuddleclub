import {
  apiFetch,
  getToken,
  setToken,
  updateAuthNav,
} from "./auth.js";
import { publicKeys } from "./public_keys.js";

const LOG_PREFIX = "[login]";
const RESEND_COOLDOWN_SEC = 15;

/** @type {ReturnType<typeof setInterval> | null} */
let resendTimer = null;

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

function clearResendTimer() {
  if (resendTimer != null) {
    clearInterval(resendTimer);
    resendTimer = null;
  }
}

function finishLogin(token) {
  clearResendTimer();
  setToken(token);
  updateAuthNav();
  window.location.replace(nextPath());
}

function googleStartUrl(email) {
  return `${publicKeys.ticketTailorProxyUrl.replace(/\/$/, "")}/auth/google/start?email=${encodeURIComponent(email)}`;
}

function googleIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("auth-google__icon");
  svg.innerHTML =
    '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>';
  return svg;
}

/**
 * @param {HTMLButtonElement} btn
 * @param {number} seconds
 */
function startResendCooldown(btn, seconds = RESEND_COOLDOWN_SEC) {
  clearResendTimer();
  let remaining = seconds;
  btn.disabled = true;
  const paint = () => {
    btn.textContent =
      remaining > 0 ? `Resend code in ${remaining}s` : "Resend code";
  };
  paint();
  resendTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearResendTimer();
      btn.disabled = false;
      btn.textContent = "Resend code";
      return;
    }
    paint();
  }, 1000);
}

/**
 * @param {HTMLElement} root
 */
function renderLoginStep(root, initialError = "") {
  clearResendTimer();
  root.innerHTML = "";

  const form = document.createElement("form");
  form.className = "auth-form";
  form.noValidate = true;

  const googleBtn = document.createElement("button");
  googleBtn.className = "btn auth-google";
  googleBtn.type = "button";
  googleBtn.append(googleIcon(), document.createTextNode("Log in with Google"));

  const divider = document.createElement("div");
  divider.className = "auth-divider";
  divider.setAttribute("role", "separator");
  const dividerText = document.createElement("span");
  dividerText.textContent = "or";
  divider.appendChild(dividerText);

  const label = document.createElement("label");
  label.className = "auth-form__label";
  label.htmlFor = "login-email";
  label.textContent = "Email";

  const input = document.createElement("input");
  input.className = "auth-form__input";
  input.id = "login-email";
  input.name = "email";
  input.type = "email";
  input.autocomplete = "email";
  input.required = true;
  input.placeholder = "you@example.com";

  const submit = document.createElement("button");
  submit.className = "btn";
  submit.type = "submit";
  submit.textContent = "Continue";

  const feedback = document.createElement("div");
  feedback.className = "auth-form__feedback";
  if (initialError) setMessage(feedback, initialError, "error");

  form.append(googleBtn, divider, label, input, submit, feedback);
  root.appendChild(form);

  async function readEligibleEmail() {
    const email = input.value.trim();
    if (!email) {
      input.focus();
      setMessage(feedback, "Enter the email from your ticket.", "error");
      return null;
    }
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
      return null;
    }
    return { email, result };
  }

  googleBtn.addEventListener("click", async () => {
    googleBtn.disabled = true;
    submit.disabled = true;
    setMessage(feedback, "Checking…");
    try {
      const checked = await readEligibleEmail();
      if (!checked) {
        googleBtn.disabled = false;
        submit.disabled = false;
        return;
      }
      if (checked.result.method !== "google") {
        setMessage(
          feedback,
          "Google sign-in is only available for Gmail addresses. Continue with email instead.",
          "error"
        );
        googleBtn.disabled = false;
        submit.disabled = false;
        return;
      }
      window.location.assign(googleStartUrl(checked.email));
    } catch (err) {
      console.error(LOG_PREFIX, "google start failed", err);
      setMessage(
        feedback,
        err.message || "Something went wrong. Try again.",
        "error"
      );
      googleBtn.disabled = false;
      submit.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    googleBtn.disabled = true;
    submit.disabled = true;
    setMessage(feedback, "Checking…");
    try {
      const checked = await readEligibleEmail();
      if (!checked) {
        googleBtn.disabled = false;
        submit.disabled = false;
        return;
      }
      await startEmailCode(root, checked.email);
    } catch (err) {
      console.error(LOG_PREFIX, "email continue failed", err);
      setMessage(
        feedback,
        err.message || "Something went wrong. Try again.",
        "error"
      );
      googleBtn.disabled = false;
      submit.disabled = false;
    }
  });
}

/**
 * @param {HTMLElement} root
 * @param {string} email
 */
async function startEmailCode(root, email) {
  clearResendTimer();
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
    renderLoginStep(root, err.message || "Could not send email.");
  }
}

/**
 * @param {HTMLElement} root
 * @param {string} email
 */
function renderCodeStep(root, email) {
  clearResendTimer();
  root.innerHTML = "";

  const form = document.createElement("form");
  form.className = "auth-form";

  const note = document.createElement("p");
  note.className = "auth-form__note";
  note.textContent = `We sent a code to ${email}.`;

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
  input.maxLength = 6;

  const submit = document.createElement("button");
  submit.className = "btn";
  submit.type = "submit";
  submit.textContent = "Continue";

  const resend = document.createElement("button");
  resend.className = "btn btn--ghost";
  resend.type = "button";
  resend.textContent = "Resend code";

  const back = document.createElement("button");
  back.className = "auth-form__back";
  back.type = "button";
  back.textContent = "Use a different email";
  back.addEventListener("click", () => renderLoginStep(root));

  const feedback = document.createElement("div");
  feedback.className = "auth-form__feedback";

  form.append(note, label, input, submit, resend, back, feedback);
  root.appendChild(form);
  input.focus();
  startResendCooldown(resend);

  resend.addEventListener("click", async () => {
    resend.disabled = true;
    setMessage(feedback, "Sending a code…");
    try {
      await apiFetch("/auth/email/start", {
        method: "POST",
        body: { email },
        auth: false,
      });
      setMessage(feedback, "Code sent.");
      startResendCooldown(resend);
    } catch (err) {
      console.error(LOG_PREFIX, "resend failed", err);
      setMessage(feedback, err.message || "Could not resend code.", "error");
      resend.disabled = false;
      resend.textContent = "Resend code";
    }
  });

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
    window.history.replaceState({}, "", "/login/");
    renderLoginStep(root, messages[error] || "Sign-in failed. Try again.");
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
      renderLoginStep(
        root,
        err.message || "That link is invalid or expired."
      );
    }
    return;
  }

  if (getToken()) {
    window.location.replace(nextPath());
    return;
  }

  renderLoginStep(root);
}

init();
