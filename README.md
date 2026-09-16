# Philippine Association of AI

The **Home** page for PAAIPE, the Philippine Association of AI Professionals
and Entrepreneurs. It was originally the About page; About became Home and the
old Home tab was removed. It is a single static HTML page with no build step and no
dependencies.

## Structure

```
index.html                  the Home page: all markup, CSS and JS in one file
member-benefits.html        Member Benefits page, reached from the Membership nav tab
resources.html              Resources library, reached from the Resources nav tab
partners.html               Partners list, reached from the Partners nav tab
partner-*.html              one profile per partner (gethired, servana, mvj, dpdigital)
events.html                 Events list, reached from the Events nav tab
event-2026-*-ai-exchange.html  one page per AI Exchange edition (Sept–Dec 2026)
assets/js/leave-dialog.js   "leaving PAAIPE" confirmation for links marked data-leave
assets/*.ics                calendar files: one per edition, plus the monthly series
assets/img/ai-exchange-cover.png            cover image on the event pages
assets/img/ai-exchange-2026-10-banner-*.png October share banners (wide and square)
assets/img/partners/        partner logos and banners
assets/img/paaipe-logo.png  logo, used in the nav and footer
assets/img/world-dots.png   dotted world map behind the hero, film and CTA sections
assets/img/ai-exchange-session.jpg  still from the PAAIPE film (Member events card, Resources video card)
assets/img/sven-bally.jpg   speaker photo on the Resources presentation card
assets/img/agents/          member portraits (Home and Member Benefits)
```

On the Resources page, the two Sven Bally slides links open a PAAIPE-styled
confirmation dialog before going to Gamma. Other outside links (the film,
partner Facebook and app-store links) go straight out, by the owner's choice.
The dialog is opt-in: `assets/js/leave-dialog.js`, included at the end of
`<body>` with a cancel label (`data-cancel`), only asks about links that carry
the `data-leave` attribute. **Continue** goes to the link, and the cancel button,
Esc or a click outside the dialog stays on the page. Without JavaScript, the
links work as plain links.

The Events page lists every AI Exchange edition and filters them into All,
Upcoming and Past; the featured card counts down to the next session and is
hidden in the Past view. Each edition has its own page with the program,
speakers, a Google Calendar link and a downloadable `.ics`. Times are Philippine
Time (UTC+8) on the page and UTC in the calendar files.

Each page is self-contained, with its own CSS. The pages link to each other
through the nav, the logo and the footer. Programs and Contact are still
placeholders (`href="#"`), as are the registration and "Speak at PAAIPE"
buttons.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## External dependencies at runtime

- **Google Fonts**: Poppins, falling back to `system-ui`.
- **Streamable**: the 60-second film is embedded from
  `https://streamable.com/e/q2877z`.

## Deployment

**A push to `main` deploys https://paaipe.org.** Netlify is linked to this
repo and publishes the repo root with no build step. Configuration lives in
[`netlify.toml`](netlify.toml):

- Deploy previews and branch deploys are off. Preview locally with the command
  above.
- Production builds are skipped only when a push changes nothing but
  `README.md` or `.gitignore` ([`scripts/netlify-ignore.sh`](scripts/netlify-ignore.sh)).
  Anything else, or any doubt, builds.
- HTML is served `max-age=0, must-revalidate`, so changes are visible on the
  next request.

Everything in the repo root is publicly reachable on the site, including this
README.
