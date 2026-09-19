/* PAAIPE Agent Portal — off-canvas nav ≤860 (R-01).
 *
 * Same injection idea as assets/js/paaipe-nav.js: the hamburger and backdrop
 * are created here so a control that exists only when this script runs can
 * never be a dead button on desktop, and fifteen portal pages do not each
 * grow their own copy of the markup.
 *
 * The real <aside class="side"> is reused — not cloned — so the current page
 * stays marked, and the menu IA is whatever the page already shipped.
 *
 * Identity stays Firebase Auth (paaipe-portal.js). This file does not talk
 * to any API.
 */
(function () {
  var shell = document.querySelector(".shell");
  if (!shell) return;
  var side = shell.querySelector(":scope > .side") || shell.querySelector(".side");
  var top = shell.querySelector(".top");
  if (!side || !top) return;

  if (!side.id) side.id = "portal-side";

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "portal-nav-burger";
  btn.setAttribute("aria-label", "Open menu");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", side.id);
  btn.appendChild(document.createElement("span"));
  top.insertBefore(btn, top.firstChild);

  var backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "portal-nav-backdrop";
  backdrop.setAttribute("aria-label", "Close menu");
  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  shell.appendChild(backdrop);

  function isMobile() {
    return window.matchMedia("(max-width:860px)").matches;
  }
  function isOpen() {
    return document.documentElement.classList.contains("portal-nav-open");
  }

  function focusableIn(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])"),
      function (el) {
        return !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true";
      }
    );
  }

  function trapList() {
    var list = [btn].concat(focusableIn(side));
    return list.filter(function (el, i, arr) { return arr.indexOf(el) === i; });
  }

  function setOpen(open) {
    open = !!open && isMobile();
    document.documentElement.classList.toggle("portal-nav-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    backdrop.hidden = !open;
    if (isMobile()) {
      if (open) {
        side.removeAttribute("inert");
        side.setAttribute("aria-hidden", "false");
      } else {
        side.setAttribute("inert", "");
        side.setAttribute("aria-hidden", "true");
      }
    } else {
      side.removeAttribute("inert");
      side.removeAttribute("aria-hidden");
    }
  }

  function syncViewport() {
    if (!isMobile()) {
      if (isOpen()) setOpen(false);
      else {
        side.removeAttribute("inert");
        side.removeAttribute("aria-hidden");
        backdrop.hidden = true;
      }
      return;
    }
    if (!isOpen()) {
      side.setAttribute("inert", "");
      side.setAttribute("aria-hidden", "true");
    }
  }

  btn.addEventListener("click", function () {
    var next = !isOpen();
    setOpen(next);
    if (next) {
      var first = focusableIn(side)[0];
      if (first) first.focus();
    } else {
      btn.focus();
    }
  });

  backdrop.addEventListener("click", function () {
    setOpen(false);
    btn.focus();
  });

  side.addEventListener("click", function (e) {
    if (e.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (!isOpen()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btn.focus();
      return;
    }
    if (e.key !== "Tab") return;
    var list = trapList();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  window.addEventListener("resize", syncViewport);
  if (window.matchMedia) {
    window.matchMedia("(max-width:860px)").addEventListener("change", syncViewport);
  }

  syncViewport();
  document.documentElement.setAttribute("data-paaipe-portal-shell", "ready");
})();
