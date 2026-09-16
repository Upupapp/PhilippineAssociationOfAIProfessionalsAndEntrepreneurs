/* The branded confirmation email for an AI Exchange registration.
 *
 * WHY THIS IS NOT SENT FROM THE BROWSER. A mail queue a client can write to is
 * an open relay: anyone could enqueue mail addressed to anyone, sent from
 * paaipe.org. firestore.rules therefore deny every client write to the mail
 * collection, and this renders SERVER-side only.
 *
 * Email HTML is not web HTML. Tables, inline styles, no external stylesheet, no
 * flex or grid, and a plain-text alternative - Outlook and Gmail strip or ignore
 * most of what a browser accepts.
 */

const SITE = "https://paaipe.org";
const NAVY = "#002166", GOLD = "#F2A71B", INK = "#0f1e3d", MUTED = "#4a5a7a",
      PALE = "#EAF3FC", LINE = "#c9dcf3";

/** The October edition. Every value here matches assets/2026-10-ai-exchange.ics,
 *  which is the authority for the date and time - a confirmation that disagreed
 *  with the calendar file would be worse than none. */
export const OCTOBER_2026 = {
  name:       "PAAIPE AI Exchange — October 2026",
  dateLong:   "Tuesday, 13 October 2026",
  timeLong:   "8:00 – 9:30 PM PHT (UTC+8)",
  where:      "Online via Zoom",
  icsUrl:     `${SITE}/assets/2026-10-ai-exchange.ics`,
  eventUrl:   `${SITE}/event-2026-10-ai-exchange`,
  gcalUrl:    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
              "&text=PAAIPE%20AI%20Exchange%20%E2%80%94%20October%202026" +
              "&dates=20261013T120000Z/20261013T133000Z" +
              "&details=Online.%20Join%20link%20is%20sent%20to%20registered%20participants%20by%20email." +
              "&location=Online&ctz=Asia/Manila",
};

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const btn = (href, label, solid) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 8px 8px 0">
    <tr><td align="center" bgcolor="${solid ? GOLD : "#ffffff"}"
        style="border-radius:999px;border:1px solid ${solid ? GOLD : LINE}">
      <a href="${href}" target="_blank"
         style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;
                font-size:14px;font-weight:bold;text-decoration:none;
                color:${solid ? NAVY : NAVY}">${esc(label)}</a>
    </td></tr>
  </table>`;

const row = (label, value) => `
  <tr>
    <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
               color:${MUTED};width:130px;vertical-align:top">${esc(label)}</td>
    <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;
               color:${INK};font-weight:bold">${esc(value)}</td>
  </tr>`;

export function renderRegistrationEmail({ fullName, event = OCTOBER_2026 }) {
  const first = String(fullName || "").trim().split(/\s+/)[0] || "there";
  const subject = `You're registered — ${event.name}`;

  const preheader =
    `${event.dateLong}, ${event.timeLong}. Add it to your calendar; PAAIPE will email your join link nearer the day.`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${PALE}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PALE}">
 <tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden">

   <tr><td style="background:${NAVY};padding:20px 28px">
     <!-- The logo artwork is dark navy, so on a navy header it disappears. The
          portal sidebar solves this the same way: sit it on a white panel. -->
     <table role="presentation" cellpadding="0" cellspacing="0" border="0">
       <tr><td bgcolor="#ffffff" style="border-radius:10px;padding:8px 14px">
         <img src="${SITE}/assets/img/paaipe-logo.png" width="124" alt="PAAIPE"
              style="display:block;border:0;width:124px;height:auto">
       </td></tr>
     </table>
   </td></tr>

   <tr><td style="padding:30px 28px 8px">
     <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;
               letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};font-weight:bold">You're registered</p>
     <h1 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;
                line-height:1.25;color:${NAVY}">Hi ${esc(first)}, your place is confirmed.</h1>
     <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${INK}">
       Thanks for registering for the ${esc(event.name)}. Here are the details.</p>
   </td></tr>

   <tr><td style="padding:18px 28px 4px">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:${PALE};border-radius:12px">
       <tr><td style="padding:16px 18px">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
           ${row("Event", event.name)}
           ${row("Date", event.dateLong)}
           ${row("Time", event.timeLong)}
           ${row("Where", event.where)}
         </table>
       </td></tr>
     </table>
   </td></tr>

   <tr><td style="padding:20px 28px 0">
     <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
               font-weight:bold;color:${NAVY}">Add it to your calendar</p>
     ${btn(event.gcalUrl, "Add to Google Calendar", true)}
     ${btn(event.icsUrl, "Apple / Outlook (.ics)", false)}
   </td></tr>

   <tr><td style="padding:14px 28px 0">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border-left:4px solid ${GOLD};background:#fdf1dd;border-radius:8px">
       <tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                      line-height:1.6;color:#7a4a06">
         <b>Watch your inbox.</b> This message confirms your registration only. PAAIPE will send you
         follow-up emails closer to the date with your Zoom joining link, the topic and speaker once
         announced, and any other information from the organisers. If you don't see them, please check
         your spam or promotions folder and mark us as safe.
       </td></tr>
     </table>
   </td></tr>

   <tr><td style="padding:20px 28px 28px">
     ${btn(event.eventUrl, "View the event page", false)}
   </td></tr>

   <tr><td style="background:${PALE};padding:20px 28px">
     <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;
               line-height:1.6;color:${MUTED}">
       Philippine Association of AI Professionals and Entrepreneurs<br>
       Building the Philippines' AI-Powered Future — Together.</p>
     <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED}">
       You're receiving this because you registered for this event on
       <a href="${SITE}" style="color:${NAVY}">paaipe.org</a>.
       How we handle your details is in our
       <a href="${SITE}/privacy-notice" style="color:${NAVY}">Privacy Notice</a>.</p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;

  const text = [
    `You're registered — ${event.name}`, "",
    `Hi ${first}, your place is confirmed.`, "",
    `Event: ${event.name}`,
    `Date:  ${event.dateLong}`,
    `Time:  ${event.timeLong}`,
    `Where: ${event.where}`, "",
    `Add to Google Calendar: ${event.gcalUrl}`,
    `Apple / Outlook (.ics): ${event.icsUrl}`,
    `Event page: ${event.eventUrl}`, "",
    "WATCH YOUR INBOX. This message confirms your registration only. PAAIPE will send",
    "follow-up emails closer to the date with your Zoom joining link, the topic and",
    "speaker once announced, and any other information from the organisers. If you do",
    "not see them, please check your spam or promotions folder.", "",
    "Philippine Association of AI Professionals and Entrepreneurs",
    `You are receiving this because you registered on ${SITE}.`,
    `Privacy Notice: ${SITE}/privacy-notice`,
  ].join("\n");

  return { subject, html, text, preheader };
}
