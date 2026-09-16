// PAAIPE confirmation shown before a link takes the visitor to another site.
//
// Include once, at the end of <body>:
//   <script src="assets/js/leave-dialog.js" data-cancel="Back to Resources"></script>
// Optional: data-title="..." replaces the heading.
//
// Opt-in: only links marked data-leave (and pointing at another host) are asked
// about, e.g. <a href="https://gamma.app/..." data-leave>View slides</a>.
// Links keep their real href, so they still work without JavaScript. With it,
// Continue follows the link (in a new tab for target=_blank, cmd/ctrl/shift-click
// or middle-click); the cancel button, Esc or a click on the backdrop stays.
(function () {
  const script = document.currentScript;
  const cancelLabel = (script && script.dataset.cancel) || 'Stay on PAAIPE';
  const titleText = (script && script.dataset.title) || 'This link opens on another site';

  const style = document.createElement('style');
  style.textContent = `
  .leave{border:0;padding:0;border-radius:22px;width:min(520px,calc(100vw - 32px));max-width:none;background:#fff;color:var(--ink);box-shadow:0 30px 80px rgba(0,16,51,.35),0 0 0 1px rgba(21,187,234,.25);overflow:hidden}
  .leave::backdrop{background:rgba(3,15,45,.62);backdrop-filter:blur(4px)}
  .leave[open]{animation:leaveIn .22s cubic-bezier(.2,.7,.2,1)}
  @keyframes leaveIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
  .leave .band{position:relative;background:linear-gradient(120deg,var(--navy),#031b52 55%,var(--royal));color:#fff;padding:26px 28px 22px;overflow:hidden}
  .leave .band img{position:absolute;right:-30%;top:-40%;width:110%;max-width:none;opacity:.14;pointer-events:none}
  .leave .ico{position:relative;width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.1);border:1px solid rgba(191,227,250,.35);display:grid;place-items:center}
  .leave .ico svg{width:24px;height:24px;stroke:var(--lgold);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .leave .kicker{position:relative;display:block;margin-top:16px;font-size:11px;font-weight:700;letter-spacing:.12em;color:#BFE3FA}
  .leave h2{position:relative;color:#fff;font-size:23px;margin-top:6px}
  .leave .rule{position:relative;width:48px;height:4px;border-radius:4px;background:linear-gradient(90deg,var(--gold),var(--lgold));margin-top:12px}
  .leave .body{padding:22px 28px 26px}
  .leave .body p{color:var(--muted);font-size:15px}
  .leave .dest{display:flex;align-items:center;gap:12px;margin-top:16px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--pale)}
  .leave .dest svg{flex:none;width:20px;height:20px;stroke:var(--royal);fill:none;stroke-width:1.8}
  .leave .dest b{display:block;color:var(--navy);font-size:15px}
  .leave .dest small{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
  .leave .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
  .leave .actions .btn{flex:1 1 auto;justify-content:center;white-space:nowrap;padding:12px 20px;font-size:15px}
  @media (prefers-reduced-motion:reduce){.leave[open]{animation:none}}`;
  document.head.appendChild(style);

  const dlg = document.createElement('dialog');
  dlg.className = 'leave';
  dlg.id = 'leave';
  dlg.setAttribute('aria-labelledby', 'leave-title');
  dlg.setAttribute('aria-describedby', 'leave-desc');
  dlg.innerHTML = `
  <div class="band">
    <img src="assets/img/world-dots.png" alt="" aria-hidden="true">
    <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 14 20 4M19 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></span>
    <span class="kicker">LEAVING PAAIPE</span>
    <h2 id="leave-title"></h2>
    <div class="rule"></div>
  </div>
  <div class="body">
    <p id="leave-desc">You're about to leave the PAAIPE website. The site below isn't run by PAAIPE, so its own content, terms and privacy practices apply.</p>
    <div class="dest">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
      <div><b id="leave-host"></b><small id="leave-url"></small></div>
    </div>
    <div class="actions">
      <button type="button" class="btn btn-ghost" id="leave-cancel"></button>
      <button type="button" class="btn btn-gold" id="leave-go"><span class="dot"></span><span id="leave-go-text">Continue</span></button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  const hostEl = document.getElementById('leave-host');
  const urlEl = document.getElementById('leave-url');
  const goBtn = document.getElementById('leave-go');
  const goText = document.getElementById('leave-go-text');
  document.getElementById('leave-title').textContent = titleText;
  document.getElementById('leave-cancel').textContent = cancelLabel;
  let pending = null;

  const isExternal = a => /^https?:$/.test(a.protocol) && a.host !== location.host;
  const follow = (href, newTab) => newTab ? window.open(href, '_blank', 'noopener') : window.location.assign(href);

  function ask(e, forceNewTab) {
    const a = e.target.closest('a[data-leave][href]');
    if (!a || !isExternal(a) || e.defaultPrevented) return;
    e.preventDefault();
    const newTab = forceNewTab || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey;
    const host = a.hostname.replace(/^www\./, '');
    if (typeof dlg.showModal !== 'function') {
      if (window.confirm('This PAAIPE link opens on another site (' + host + '). Continue?')) follow(a.href, newTab);
      return;
    }
    pending = { href: a.href, newTab };
    hostEl.textContent = host;
    urlEl.textContent = a.href;
    goText.textContent = 'Continue to ' + host;
    dlg.showModal();
    goBtn.focus();
  }

  function stay() { pending = null; if (dlg.open) dlg.close(); }

  document.addEventListener('click', e => { if (e.button === 0) ask(e, false); });
  document.addEventListener('auxclick', e => { if (e.button === 1) ask(e, true); });
  goBtn.addEventListener('click', () => {
    const p = pending; stay();
    if (p) follow(p.href, p.newTab);
  });
  document.getElementById('leave-cancel').addEventListener('click', stay);
  dlg.addEventListener('cancel', () => { pending = null; });          // Esc
  dlg.addEventListener('click', e => { if (e.target === dlg) stay(); }); // backdrop
})();
