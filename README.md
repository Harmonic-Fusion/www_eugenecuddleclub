# Eugene Cuddle Club website

The site at [eugenecuddleclub.com](https://eugenecuddleclub.com). Built with [Eleventy](https://www.11ty.dev/), hosted free on GitHub Pages.

Every page is a plain text file. Edit the words, save, push, and the site rebuilds itself in about a minute.

---

## Editing the text

All the page content lives in `src/`, one file per page:


| File                     | Page            |
| ------------------------ | --------------- |
| `src/index.md`           | Home            |
| `src/events.md`          | Events          |
| `src/events/event.md`    | Single event    |
| `src/faq.md`             | FAQ             |
| `src/code-of-conduct.md` | Code of Conduct |
| `src/contact.md`         | Contact         |
| `src/login.md`           | Log in          |


Open any of them in a text editor. At the top you'll see a block fenced by `---` lines:

```markdown
---
title: FAQ
lede: The questions we get most often.
---
```

That's the page title and the subtitle under it. **Everything below the second** `---` **is the page body.** Edit it like normal writing. A few formatting basics:

```markdown
## A heading

Normal paragraph text. Blank line between paragraphs.

- A bullet
- Another bullet

**Bold text** and [a link to another page](/faq/).
```

### Things that repeat across pages

Details that appear in several places — the contact email, the venue line, the ticket links, the navigation menu — live in one file, `src/_data/site.json`, so you change them once:

```json
{
  "email": "instigators@eugenecuddleclub.com",
  "venue": "The Bliss Fungalow, Eugene 97405",
  "ticketsUrl": "https://www.tickettailor.com/events/eugenecuddleclub/"
}
```

In the page files these appear as `{{ site.email }}`, `{{ site.venue }}`, and so on. Leave those curly braces alone and they'll fill themselves in.

To add or remove a menu item, edit the `nav` list in that same file.

---



## Adding photos

1. Drop the image file into `src/assets/photos/`.
2. Reference it in any page with:

```markdown
![A short description of the photo for screen readers](/assets/photos/your-file-name.jpg)
```

Two habits worth keeping. **Resize before uploading** — anything wider than about 1600 pixels just makes the site slow, and phone photos are typically 4000+. **Always write the description** in the square brackets; it's what blind visitors hear, and it shows if the image fails to load.

Given the no-photos-at-events rule in the code of conduct, only use images from shoots people explicitly opted into.

---



## Previewing your changes locally

You need [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed. Once, on a new computer:

```bash
pnpm install
```

If you will work on events (local API), also set up the Python proxy once:

```bash
cd api
cp .env.example .env
# Edit .env — at minimum TICKET_TAILOR_API_KEY, JWT_SECRET, and DATABASE_URL
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ..
```

Start Postgres (and optionally the API container) with Docker Compose from the repo root:

```bash
docker compose up -d db
```

Then apply database migrations:

```bash
cd api
.venv/bin/alembic upgrade head
cd ..
```

Point the site at the local API by editing `src/assets/js/public_keys.js`:

```js
export const publicKeys = {
  ticketTailorProxyUrl: "http://localhost:8000",
};
```

For a host-run API against Compose Postgres, keep:

`DATABASE_URL=postgresql+asyncpg://ecc:ecc@localhost:5432/ecc`

Then any time you want to work on the site:

```bash
pnpm start
```

That starts Eleventy on [http://localhost:8080](http://localhost:8080) and the FastAPI proxy on [http://localhost:8000](http://localhost:8000). The API loads secrets from `api/.env`. Both reload as you save. Press `Ctrl+C` to stop.

Or run API + Postgres entirely in Docker:

```bash
docker compose up --build
```

To run only one side: `pnpm run start:site` or `pnpm run start:api`.

To just build the site without a preview server, run `pnpm run build`. The finished site lands in `_site/`, which is generated output — never edit it directly and never commit it.

---



## Publishing

```bash
git add .
git commit -m "Update the FAQ"
git push
```

Pushing to the `main` branch triggers the GitHub Action in `.github/workflows/deploy.yml`, which builds the site and publishes it. Watch it run under the **Actions** tab on GitHub. It usually takes under a minute. If it shows a red X, click into it to see what failed — a typo in `site.json` is the usual culprit, since JSON is picky about commas and quotes.

### First-time setup

Already done — this repo is `Harmonic-Fusion/www_eugenecuddleclub`. For reference, that was:

```bash
git branch -M main
git remote add origin git@github.com:Harmonic-Fusion/www_eugenecuddleclub.git
git push -u origin main
```

Then in the repo on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**. Under **Custom domain**, enter `eugenecuddleclub.com` — the bare domain, with no `www` in front. See [Domain setup](#domain-setup-namecheap) below for why.

---



## Domain setup (Namecheap)

The site lives at the bare domain, `eugenecuddleclub.com` — the `@` host. `www` just redirects to it, and GitHub does that redirect for you once the records below are in place.

In the Namecheap dashboard, open your domain and go to the **Advanced DNS** tab. Make sure Nameservers is set to **Namecheap BasicDNS**. Delete the default parking page / URL redirect records, then add:


| Type         | Host  | Value                        |
| ------------ | ----- | ---------------------------- |
| A Record     | `@`   | `185.199.108.153`            |
| A Record     | `@`   | `185.199.109.153`            |
| A Record     | `@`   | `185.199.110.153`            |
| A Record     | `@`   | `185.199.111.153`            |
| CNAME Record | `www` | `harmonic-fusion.github.io.` |


Three details that trip people up:

- The CNAME record's value is the **account** name, never the repo name — no `/www_eugenecuddleclub` on the end. The trailing dot is intentional.
- **Settings → Pages → Custom domain** must say `eugenecuddleclub.com`, no `www`. Put `www` there and the redirect runs backwards. That setting is the only thing tying the domain to this repo — the `CNAME` file in the repo root is ignored when publishing from a GitHub Actions workflow, which is what we do. It's harmless to keep, but changing it has no effect.
- Don't add a Namecheap **URL Redirect Record** for `www`. It looks like the right tool, but it conflicts with the CNAME record and breaks HTTPS.

DNS changes take a few minutes to a couple of hours. Once GitHub verifies the domain, tick **Enforce HTTPS** in Settings → Pages; it stays greyed out until the certificate is issued. Then check your work: `https://www.eugenecuddleclub.com` should land on `https://eugenecuddleclub.com` with the `www` gone.

---



## Events (Ticket Tailor API)

Events are managed in [Ticket Tailor](https://www.tickettailor.com/). This site loads them through a small FastAPI proxy in `api/` (so the Ticket Tailor secret key never ships to the browser). The Events page lists upcoming and past events; each event page embeds Ticket Tailor’s inline checkout widget for that event.

**Sign-in** is required to see who’s coming and the Fungalow Google Maps link. Only emails that appear on Ticket Tailor issued tickets can sign in (Google SSO for Gmail, or a Resend email code / magic link). Use **Account → Log out** in the nav when signed in.

### 1. Create a Ticket Tailor API key

1. Sign in to Ticket Tailor and open your box office.
2. Go to **Box office settings → API** (or **Developers / API keys**, depending on the UI).
3. Create an API key. It looks like `sk_…` and only accesses that box office.
4. See the [Ticket Tailor API docs](https://developers.tickettailor.com/docs/api/ticket-tailor-api) for auth details (HTTP Basic Auth: key as username, empty password).

### 2. Run the API locally

One-time setup is under [Previewing your changes locally](#previewing-your-changes-locally). Day to day, `pnpm start` runs the API with the site (uvicorn reads `api/.env` automatically). Postgres should already be up (`docker compose up -d db`) and migrations applied (`alembic upgrade head`).

API only:

```bash
pnpm run start:api
```

Or full stack with Compose (runs `alembic upgrade head` then uvicorn):

```bash
docker compose up --build
```

### 3. Auth providers (Resend + Google)

Fill these in `api/.env` (and Railway Variables in production):

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Postgres (Railway’s `postgresql://` URL is fine) |
| `JWT_SECRET` | Long random secret for session tokens |
| `SITE_URL` | Site origin, e.g. `http://localhost:8080` or `https://eugenecuddleclub.com` |
| `RESEND_API_KEY` / `RESEND_FROM` | Transactional login emails |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth web client |

**Resend:** create an API key at [resend.com](https://resend.com/). For local testing you can use their `onboarding@resend.dev` from-address. For production, verify `eugenecuddleclub.com` in Resend (Domains) and set `RESEND_FROM` to `Eugene Cuddle Club <community@eugenecuddleclub.com>` — that mailbox stays on Namecheap Private Email for receiving; Resend only sends the login codes (add Resend’s SPF/DKIM DNS records without changing Namecheap MX).

**Google:** in Google Cloud Console create an OAuth **Web application** client. Authorized redirect URI must match `GOOGLE_REDIRECT_URI` exactly (local: `http://localhost:8000/auth/google/callback`; production: `https://<your-railway-host>/auth/google/callback`).

### 4. Database migrations (Alembic)

Schema changes live under `api/alembic/versions/`. After pulling new migrations:

```bash
cd api
.venv/bin/alembic upgrade head
```

Create a new revision after model changes:

```bash
.venv/bin/alembic revision --autogenerate -m "describe change"
.venv/bin/alembic upgrade head
```

### 5. Deploy the API to Railway

1. Create a new Railway project and service from this repo.
2. Set the service **Root Directory** to `api/` (so it finds `Dockerfile` and `railway.toml`).
3. Add a **Postgres** plugin and wire `DATABASE_URL` from it (Railway’s `postgresql://` URL is fine — the API rewrites it to `postgresql+asyncpg://` automatically).
4. Add variables:
   - `TICKET_TAILOR_API_KEY` — your `sk_…` key
   - `CORS_ORIGINS` — `https://eugenecuddleclub.com,http://localhost:8080`
   - `JWT_SECRET`, `SITE_URL=https://eugenecuddleclub.com`
   - `RESEND_API_KEY`, `RESEND_FROM`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://<railway-host>/auth/google/callback`
5. Deploy. Each start runs `alembic upgrade head` via `entrypoint.sh`, then uvicorn. Copy the public HTTPS URL Railway gives you.
6. Put that URL in `src/assets/js/public_keys.js` as `ticketTailorProxyUrl` (no trailing slash required).

`api/railway.toml` configures the Dockerfile builder, start command (migrations + API), and `/health` check. Do **not** put secrets in git or in `public_keys.js`.

### 6. Public config file

`src/assets/js/public_keys.js` holds values that are fine to publish (the proxy URL). Secret keys stay in Railway / `api/.env` only.

---



## Private notes

The `.plans/` folder holds internal planning documents and is excluded from git by `.gitignore`. **Nothing in it is ever published.** Keep it that way — it contains phone numbers, venue agreements, and the internal incident response policy.

Before committing anything unfamiliar, `git status` is worth a glance. If you ever see a file listed there that shouldn't be public, don't commit it.

---



## Project layout

```
api/                        FastAPI proxy (Docker → Railway)
  Dockerfile
  railway.toml
  alembic/                  SQLAlchemy migrations
  config.py                 env-based settings
  db.py / models.py         Postgres (users, OTPs, ticket emails)
  auth.py                   login (Google + Resend OTP)
  email_cache.py            Ticket Tailor buyer-email sync
  main.py
  ticket_tailor.py
docker-compose.yaml         local Postgres + API
src/
  index.md, events.md, ...  the pages you edit
  login.md                  auth UI
  events/event.md           per-event shell (loads data from the API)
  _data/site.json           shared details and the nav menu
  _includes/base.njk        the page shell: header, footer, nav
  assets/css/style.css      all styling, brand colors at the top
  assets/js/public_keys.js  public proxy URL (not secrets)
  assets/js/auth.js         JWT helpers + nav Log in / Account menu
  assets/js/events-*.js     events list + detail
  assets/img/logo.png       logo and favicon
  assets/photos/            put photos here
.github/workflows/deploy.yml  auto-publishing
CNAME                       the custom domain
_site/                      generated output, not committed
```

