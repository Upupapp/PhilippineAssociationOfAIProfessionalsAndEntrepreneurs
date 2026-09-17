/* Official PAAIPE branded email shell.
 *
 * Source of truth for the layout is assets/email/paaipe-email-template.html
 * (signature: assets/email/paaipe-signature.html). This module renders that
 * same HTML so admin Preview, a test send, and a mass send cannot drift into
 * three different letters. Do not invent a second layout here.
 *
 * Marks are public files under /assets/email/. The HTML always names them at
 * https://paaipe.org/assets/email/… — email clients cannot load file:// or a
 * localhost preview URL. Admin Preview rewrites that origin to the current
 * host so the marks actually appear before the files are on production.
 */
export const EMAIL_FROM = "agent@paaipe.org";
export const EMAIL_TZ = "Asia/Manila";
export const EMAIL_SITE = "https://paaipe.org";

export const EMAIL_BRAND = {
  header:  "#0E3A8C",
  cyan:    "#00C0FC",
  gold:    "#FCA800",
  navy:    "#00246C",
  footer:  "#0B1A33",
  ink:     "#1a202c",
};

export const EMAIL_ASSETS = {
  headerMark: `${EMAIL_SITE}/assets/email/logo-mark-header.png`,
  signMark:   `${EMAIL_SITE}/assets/email/logo-mark-email.png`,
};

export const DEFAULT_BODY_HTML =
  `<p>Dear [Name],</p>\n<p>[Your reply here]</p>\n<p>Warm regards,</p>`;

const P_STYLE = "margin:0 0 14px 0;";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Strip anything an email body has no business carrying. Admin-only, but a
 *  compose box is still a compose box. */
export function sanitizeBodyHtml(html) {
  const raw = String(html ?? "");
  if (typeof document === "undefined") {
    return raw.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  }
  const box = document.createElement("div");
  box.innerHTML = raw;
  box.querySelectorAll("script,iframe,object,embed,link,meta,style").forEach(n => n.remove());
  box.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(a => {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      if ((a.name === "href" || a.name === "src") && /^\s*javascript:/i.test(a.value))
        el.removeAttribute(a.name);
    });
  });
  return box.innerHTML;
}

/** Plain text or editor HTML → inline-styled paragraphs the shell expects. */
export function styleBodyHtml(html) {
  let s = sanitizeBodyHtml(html).trim();
  if (!s) s = DEFAULT_BODY_HTML;
  if (!/<[a-z][\s\S]*>/i.test(s)) {
    return s.split(/\n+/).map(line =>
      `<p style="${P_STYLE}">${esc(line) || "&nbsp;"}</p>`).join("");
  }
  s = s.replace(/<div(\s[^>]*)?>/gi, "<p$1>").replace(/<\/div>/gi, "</p>");
  s = s.replace(/<p(\s[^>]*)?>/gi, (m, attrs = "") =>
    /style\s*=/i.test(attrs) ? m : `<p style="${P_STYLE}"${attrs}>`);
  s = s.replace(/<a\s/gi, '<a style="color:#00A8E8;text-decoration:underline;" ');
  s = s.replace(/<h2(\s[^>]*)?>/gi, '<h2 style="margin:0 0 14px 0;font-size:20px;color:#00246C;"$1>');
  s = s.replace(/<(ul|ol)(\s[^>]*)?>/gi, '<$1 style="margin:0 0 14px 0;padding-left:22px;"$2>');
  return s;
}

export function applyPreviewSamples(html, {
  firstName = "Maria", lastName = "Santos", registrationId = "REG-0001",
} = {}) {
  return String(html ?? "")
    .replace(/\[Name\]/g, firstName)
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName)
    .replace(/\{\{\s*last_name\s*\}\}/g, lastName)
    .replace(/\{\{\s*registration_id\s*\}\}/g, registrationId);
}

/** The letter that would be sent. Logo src is always https://paaipe.org/… */
export function wrapEmailHtml(bodyHtml, { subject = "PAAIPE Email" } = {}) {
  const inner = styleBodyHtml(bodyHtml);
  const { header, cyan, gold, navy, footer, ink } = EMAIL_BRAND;
  const title = esc(subject || "PAAIPE Email");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #d8e0ea;">

          <tr>
            <td style="background-color:${header};padding:6px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;width:28px;line-height:0;">
                    <img src="${EMAIL_ASSETS.headerMark}" width="28" height="28" alt="" style="display:block;width:28px;height:28px;border:0;">
                  </td>
                  <td style="vertical-align:middle;padding-left:10px;">
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.04em;color:${cyan};line-height:28px;mso-line-height-rule:exactly;">PAAIPE</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="height:2px;background-color:${gold};font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:28px 28px 8px 28px;color:${ink};font-size:15px;line-height:1.55;">
              ${inner}
            </td>
          </tr>

          <tr>
            <td style="padding:8px 28px 22px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0;">
                <tr>
                  <td style="padding-top:16px;width:44px;vertical-align:top;">
                    <img src="${EMAIL_ASSETS.signMark}" width="36" height="36" alt="PAAIPE" style="display:block;border:0;border-radius:3px;background-color:#000000;">
                  </td>
                  <td style="padding-top:16px;padding-left:10px;vertical-align:top;">
                    <div style="font-size:15px;font-weight:700;color:${navy};line-height:1.3;">PAAIPE Agent</div>
                    <div style="font-size:13px;color:#475569;margin-top:2px;">
                      <a href="mailto:${EMAIL_FROM}" style="color:#475569;text-decoration:none;">${EMAIL_FROM}</a>
                    </div>
                    <div style="font-size:13px;margin-top:4px;">
                      <a href="${EMAIL_SITE}" style="color:#00A8E8;text-decoration:none;">${EMAIL_SITE}</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:${footer};padding:18px 28px;">
              <div style="font-size:11px;font-weight:700;color:#FFFFFF;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;">Official channels</div>
              <div style="font-size:12px;line-height:1.75;color:#FFFFFF;">
                <a href="${EMAIL_SITE}" style="color:#FFFFFF;text-decoration:none;">Website</a>
                &nbsp;·&nbsp;
                <a href="${EMAIL_SITE}/signup" style="color:#FFFFFF;text-decoration:none;">Join / Signup</a>
                &nbsp;·&nbsp;
                <a href="https://www.youtube.com/@PAAIPE" style="color:#FFFFFF;text-decoration:none;">YouTube</a>
                <br>
                <a href="https://www.facebook.com/profile.php?id=61593061785612" style="color:#FFFFFF;text-decoration:none;">Facebook Page</a>
                &nbsp;·&nbsp;
                <a href="https://www.facebook.com/groups/28729142806692140" style="color:#FFFFFF;text-decoration:none;">Community Group</a>
              </div>
              <div style="font-size:11px;color:#FFFFFF;margin-top:12px;line-height:1.45;">
                Philippine Association of AI Professionals and Entrepreneurs (PAAIPE) — a community for useful learning, trusted connection, and responsible AI impact in the Philippines.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Same letter, with mark URLs pointed at the page's origin so Preview can
 *  render them before (or without) a production deploy. */
export function previewEmailHtml(bodyHtml, opts = {}) {
  const html = wrapEmailHtml(bodyHtml, opts);
  const origin = opts.previewOrigin
    || (typeof location !== "undefined" && location.protocol !== "file:" && location.origin)
    || EMAIL_SITE;
  if (origin === EMAIL_SITE) return html;
  return html.split(`${EMAIL_SITE}/assets/email/`).join(`${origin}/assets/email/`);
}

export function formatManila(date, { withTime = true } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (!d || isNaN(d)) return "—";
  const opts = withTime
    ? { weekday: undefined, day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-PH", { timeZone: EMAIL_TZ, ...opts }).format(d);
}

/** datetime-local value for a Date, in Asia/Manila (UTC+8, no DST). */
export function toManilaInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EMAIL_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23",
  }).formatToParts(d);
  const g = t => parts.find(p => p.type === t)?.value || "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** Parse a datetime-local string as Asia/Manila. */
export function parseManilaInput(value) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(value || ""));
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:00+08:00`);
  return isNaN(d) ? null : d;
}
