# Philippine Association of AI

The **Home** page for PAAIPE, the Philippine Association of AI Professionals
and Entrepreneurs. It was originally the About page; About became Home and the
old Home tab was removed. It is a single static HTML page with no build step and no
dependencies.

## Structure

```
index.html                  the Home page: all markup, CSS and JS in one file
member-benefits.html        Member Benefits page, reached from the Membership nav tab
assets/img/paaipe-logo.png  logo, used in the nav and footer
assets/img/world-dots.png   dotted world map behind the hero, film and CTA sections
assets/img/ai-exchange-session.jpg  still from the PAAIPE film, on the Member events card
assets/img/agents/          member portraits, used on both pages
```

Each page is self-contained, with its own CSS. The pages link to each other
through the nav, the logo and the footer. Other nav items are still
placeholders (`href="#"`).

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
