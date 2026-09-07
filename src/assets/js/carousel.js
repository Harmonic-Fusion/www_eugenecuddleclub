/**
 * Photo carousel via Glider.js — single item, no drag, auto-advance.
 * https://nickpiscitelli.github.io/Glider.js/
 */
(function () {
  var root = document.querySelector("[data-carousel]");
  if (!root || typeof Glider !== "function") return;

  var gliderEl = root.querySelector("[data-carousel-glider]");
  var prevBtn = root.querySelector("[data-carousel-prev]");
  var nextBtn = root.querySelector("[data-carousel-next]");
  var dotsEl = root.querySelector("[data-carousel-dots]");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var delay = 5000;
  var timer = null;

  var glider = new Glider(gliderEl, {
    slidesToShow: 1,
    slidesToScroll: 1,
    draggable: false,
    scrollLock: true,
    rewind: true,
    duration: reduceMotion ? 0 : 0.5,
    dots: dotsEl,
    arrows: {
      prev: prevBtn,
      next: nextBtn,
    },
  });

  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    if (reduceMotion || glider.slides.length < 2) return;
    stop();
    timer = window.setInterval(function () {
      glider.scrollItem("next");
    }, delay);
  }

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", function (event) {
    if (!root.contains(event.relatedTarget)) start();
  });

  // Restart the timer after manual navigation so the interval feels even.
  if (prevBtn) prevBtn.addEventListener("click", start);
  if (nextBtn) nextBtn.addEventListener("click", start);
  if (dotsEl) {
    dotsEl.addEventListener("click", function (event) {
      if (event.target.classList.contains("glider-dot")) start();
    });
  }

  start();
})();
