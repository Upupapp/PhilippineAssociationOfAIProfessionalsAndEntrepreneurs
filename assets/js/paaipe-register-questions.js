/* The registration form asks exactly the questions the event says to ask.
 *
 * Event.questionsEnabled is edited in the admin console; this reads it. Untick a
 * question there and it disappears from this form - which is the point of one
 * source of truth, and the reason the keys here are the form field NAMES rather
 * than labels: a label can be reworded, a name cannot without breaking the
 * answers already stored under it.
 *
 * SAFE BY DEFAULT. If the event cannot be read - offline, or not yet in the
 * database - nothing is hidden and the form stays exactly as the HTML shipped
 * it. Hiding a question because a fetch failed would silently stop collecting
 * an answer PAAIPE wanted, and nobody would notice until the speaker brief was
 * empty.
 */
import { getEventBySlug } from "/assets/js/paaipe-events-data.js";

(async function () {
  const root = document.querySelector("[data-register-slug]");
  if (!root) return;
  let ev = null;
  try { ev = await getEventBySlug(root.dataset.registerSlug); }
  catch { document.documentElement.setAttribute("data-register-questions", "offline"); return; }
  if (!ev || !Array.isArray(ev.questionsEnabled)) {
    document.documentElement.setAttribute("data-register-questions", "default");
    return;
  }

  let hidden = 0;
  document.querySelectorAll("[data-question]").forEach(el => {
    const wanted = ev.questionsEnabled.includes(el.dataset.question);
    if (wanted) return;
    // hidden AND disabled: a field left enabled still submits, and an answer to
    // a question this event did not ask is an answer nobody can interpret
    el.style.display = "none";
    el.querySelectorAll("input, select, textarea").forEach(i => {
      i.disabled = true;
      i.required = false;
    });
    hidden++;
  });
  document.documentElement.setAttribute("data-register-questions", String(hidden));
})();
