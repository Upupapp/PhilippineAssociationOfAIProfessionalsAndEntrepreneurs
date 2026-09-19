/* Shared accordion. Default expanded. Header click collapses / expands.
 * Paul 2026-09-19: never start collapsed. */

const CHEV = '<svg class="paaipe-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export function collapseChevron() {
  return CHEV;
}

export function setCollapsed(group, collapsed) {
  if (!group) return;
  group.classList.toggle("is-collapsed", Boolean(collapsed));
  const hd = group.querySelector("[data-collapse-hd]");
  if (hd) hd.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

export function isCollapsed(group) {
  return Boolean(group?.classList.contains("is-collapsed"));
}

/** Wire every [data-collapse-hd] under root. Safe to call after re-render. */
export function bindCollapse(root = document, { onToggle } = {}) {
  const host = root && root.querySelectorAll ? root : document;
  host.querySelectorAll("[data-collapse-hd]").forEach(hd => {
    if (hd.dataset.collapseBound === "1") return;
    hd.dataset.collapseBound = "1";
    if (!hd.hasAttribute("aria-expanded")) hd.setAttribute("aria-expanded", "true");
    hd.addEventListener("click", e => {
      const g = hd.closest("[data-collapse]");
      if (!g) return;
      e.preventDefault();
      const next = !isCollapsed(g);
      setCollapsed(g, next);
      if (typeof onToggle === "function") onToggle(g, next);
    });
  });
}
