import { applySubscribeLink } from "./events-api.js";

/**
 * Wire any [data-subscribe-cta] anchors to the resolved mailing-list URL.
 */
async function init() {
  const links = document.querySelectorAll("a[data-subscribe-cta]");
  if (!links.length) return;

  await Promise.all(
    [...links].map((link) =>
      applySubscribeLink(link, {
        subscribeUrl:
          link.dataset.subscribeUrl || link.getAttribute("href") || "",
        email: link.dataset.email || "",
        text: link.dataset.subscribeText || link.textContent.trim() || undefined,
      })
    )
  );
}

init();
