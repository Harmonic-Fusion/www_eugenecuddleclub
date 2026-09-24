import {
  apiFetch,
  clearToken,
  getMe,
  loginUrl,
  updateAuthNav,
} from "./auth.js";

const LOG_PREFIX = "[account]";

async function init() {
  const root = document.getElementById("account-app");
  if (!root) return;

  let me;
  try {
    me = await getMe();
  } catch (err) {
    console.error(LOG_PREFIX, "getMe failed", err);
    root.innerHTML = "";
    const p = document.createElement("p");
    p.className = "form-note auth-panel__error";
    p.textContent = "Could not load your account. Try again later.";
    root.appendChild(p);
    return;
  }

  if (!me) {
    window.location.replace(loginUrl("/account/"));
    return;
  }

  root.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "auth-form";

  const emailRow = document.createElement("p");
  emailRow.innerHTML = "";
  const label = document.createElement("strong");
  label.textContent = "Signed in as ";
  emailRow.append(label, document.createTextNode(me.email));

  const actions = document.createElement("div");
  actions.className = "btn-row btn-row--stack";

  const logout = document.createElement("button");
  logout.className = "btn";
  logout.type = "button";
  logout.textContent = "Log out";
  logout.addEventListener("click", async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* client-side clear is enough */
    }
    clearToken();
    updateAuthNav();
    window.location.href = "/";
  });

  const del = document.createElement("button");
  del.className = "btn btn--ghost";
  del.type = "button";
  del.textContent = "Delete account";
  del.addEventListener("click", async () => {
    if (
      !window.confirm(
        "Delete your account on this site? You can sign in again later with a ticket email."
      )
    ) {
      return;
    }
    try {
      await apiFetch("/auth/me", { method: "DELETE" });
      clearToken();
      updateAuthNav();
      window.location.href = "/";
    } catch (err) {
      console.error(LOG_PREFIX, "delete failed", err);
      window.alert(err.message || "Could not delete account.");
    }
  });

  actions.append(logout, del);
  panel.append(emailRow, actions);
  root.appendChild(panel);
}

init();
