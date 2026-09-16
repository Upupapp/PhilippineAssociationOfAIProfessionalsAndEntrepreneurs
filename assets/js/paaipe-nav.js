/* PAAIPE — mobile navigation (P-12).
 *
 * Below 960px every content page hid the menu with `nav ul{display:none}` and
 * put nothing in its place, so a phone visitor could reach only the logo and the
 * one CTA button. That is the whole site's navigation missing on the device most
 * people will use.
 *
 * The button and its styles are injected here rather than written into 16 pages
 * for two reasons: the nav markup is not identical across them, and a button
 * that exists only when its script runs can never be a dead control.
 *
 * The real <ul> is reused - not cloned - so there is one set of links, one set
 * of ids, and the current page stays marked with aria-current.
 */
(function () {
  var nav = document.querySelector("nav");
  if (!nav) return;
  var wrap = nav.querySelector(".wrap");
  var list = nav.querySelector("ul");
  if (!wrap || !list || !list.querySelector("a")) return;   // minimal chrome: nothing to reveal

  if (!list.id) list.id = "paaipe-nav-menu";

  var css = document.createElement("style");
  css.textContent =
    "@media (max-width:960px){" +
      "nav .burger{display:inline-flex;align-items:center;justify-content:center;" +
        "width:46px;height:46px;margin-left:auto;border:1px solid var(--line,#c9dcf3);" +
        "border-radius:12px;background:#fff;cursor:pointer;padding:0;flex:none}" +
      "nav .burger:focus-visible{outline:3px solid var(--cyan,#15BBEA);outline-offset:2px}" +
      "nav .burger span{position:relative;display:block;width:20px;height:2px;border-radius:2px;" +
        "background:var(--navy,#002166);transition:transform .18s,opacity .18s}" +
      "nav .burger span::before,nav .burger span::after{content:'';position:absolute;left:0;" +
        "width:20px;height:2px;border-radius:2px;background:var(--navy,#002166);transition:transform .18s}" +
      "nav .burger span::before{top:-6px}nav .burger span::after{top:6px}" +
      "nav .burger[aria-expanded='true'] span{background:transparent}" +
      "nav .burger[aria-expanded='true'] span::before{transform:translateY(6px) rotate(45deg)}" +
      "nav .burger[aria-expanded='true'] span::after{transform:translateY(-6px) rotate(-45deg)}" +
      /* the CTA keeps its place; the burger sits to its right. Without nowrap
         "Agent Access" wraps to two lines at 400px and crowds the 86px bar. */
      "nav .wrap>a.btn{margin-left:auto;white-space:nowrap}nav .burger{margin-left:10px}" +
    "}" +
    "@media (max-width:430px){nav .wrap>a.btn{padding:10px 14px;font-size:13.5px}" +
      "nav .logo img{height:44px}" +
      "nav.paaipe-open ul{display:block;position:absolute;left:0;right:0;top:100%;" +
        "background:#fff;border-top:1px solid #e6eef9;border-bottom:1px solid #e6eef9;" +
        "margin:0;padding:6px 28px 14px;box-shadow:0 18px 40px rgba(6,33,102,.10);" +
        "max-height:calc(100vh - 86px);overflow-y:auto}" +
      "nav.paaipe-open ul li{list-style:none}" +
      "nav.paaipe-open ul li a{display:block;padding:13px 0;font-size:16px;" +
        "border-bottom:1px solid #eef4fc}" +
      "nav.paaipe-open ul li:last-child a{border-bottom:0}" +
      "nav.paaipe-open ul li a.active::after{display:none}" +
      "nav.paaipe-open ul li a.active{color:var(--navy,#002166);font-weight:700}" +
    "}" +
    "@media (min-width:961px){nav .burger{display:none}}";
  document.head.appendChild(css);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "burger";
  btn.setAttribute("aria-label", "Menu");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", list.id);
  btn.appendChild(document.createElement("span"));
  wrap.appendChild(btn);

  function setOpen(open) {
    nav.classList.toggle("paaipe-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
  }
  var isOpen = function () { return btn.getAttribute("aria-expanded") === "true"; };

  btn.addEventListener("click", function () { setOpen(!isOpen()); });

  // following a link should not leave the menu hanging open behind the new page
  list.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) { setOpen(false); btn.focus(); }
  });

  document.addEventListener("click", function (e) {
    if (isOpen() && !nav.contains(e.target)) setOpen(false);
  });

  // widening past the breakpoint restores the desktop bar; a stale open state
  // would otherwise leave the dropdown styles applied
  window.addEventListener("resize", function () {
    if (window.innerWidth > 960 && isOpen()) setOpen(false);
  });

  document.documentElement.setAttribute("data-paaipe-nav", "ready");
})();
