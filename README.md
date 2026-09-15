# Philippine Association of AI

The **Home** page for PAAIPE, the Philippine Association of AI Professionals
and Entrepreneurs. It was originally the About page; About became Home and the
old Home tab was removed. It is a single static HTML page with no build step and no
dependencies.

## Structure

```
index.html                  the Home page: all markup, CSS and JS in one file
assets/img/paaipe-logo.png  logo, used in the nav and footer
assets/img/world-dots.png   dotted world map behind the hero and film sections
assets/img/agents/          portraits for "The people behind PAAIPE"
```

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

Not deployed yet. This repo has no remote, CI or Netlify configuration.
