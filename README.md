# Eugene Cuddle Club website

The site at [eugenecuddleclub.com](https://eugenecuddleclub.com). Built with [Eleventy](https://www.11ty.dev/), hosted free on GitHub Pages.

Every page is a plain text file. Edit the words, save, push, and the site rebuilds itself in about a minute.

---

## Editing the text

All the page content lives in `src/`, one file per page:

| File | Page |
| --- | --- |
| `src/index.md` | Home |
| `src/about.md` | About |
| `src/events.md` | Events |
| `src/faq.md` | FAQ |
| `src/code-of-conduct.md` | Code of Conduct |
| `src/contact.md` | Contact |

Open any of them in a text editor. At the top you'll see a block fenced by `---` lines:

```markdown
---
title: FAQ
lede: The questions we get most often.
---
```

That's the page title and the subtitle under it. **Everything below the second `---` is the page body.** Edit it like normal writing. A few formatting basics:

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

You need [Node.js](https://nodejs.org/) installed. Once, on a new computer:

```bash
npm install
```

Then any time you want to work on the site:

```bash
npm start
```

Open the address it prints (usually <http://localhost:8080>). It reloads automatically as you save. Press `Ctrl+C` in the terminal to stop.

To just build the site without a preview server, run `npm run build`. The finished site lands in `_site/`, which is generated output — never edit it directly and never commit it.

---

## Publishing

```bash
git add .
git commit -m "Update the FAQ"
git push
```

Pushing to the `main` branch triggers the GitHub Action in `.github/workflows/deploy.yml`, which builds the site and publishes it. Watch it run under the **Actions** tab on GitHub. It usually takes under a minute. If it shows a red X, click into it to see what failed — a typo in `site.json` is the usual culprit, since JSON is picky about commas and quotes.

### First-time setup

Not done yet. Create an empty repo on GitHub, then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Then in the repo on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**. Under **Custom domain**, enter `eugenecuddleclub.com`.

---

## Domain setup (Namecheap)

In the Namecheap dashboard, open your domain and go to the **Advanced DNS** tab. Make sure Nameservers is set to **Namecheap BasicDNS**. Delete the default parking page / URL redirect records, then add:

| Type | Host | Value |
| --- | --- | --- |
| A Record | `@` | `185.199.108.153` |
| A Record | `@` | `185.199.109.153` |
| A Record | `@` | `185.199.110.153` |
| A Record | `@` | `185.199.111.153` |
| CNAME Record | `www` | `YOUR-USERNAME.github.io.` |

Replace `YOUR-USERNAME` with your GitHub username. The trailing dot on the CNAME value is intentional.

DNS changes take anywhere from a few minutes to a couple of hours. Once GitHub verifies the domain, tick **Enforce HTTPS** in Settings → Pages. That checkbox stays greyed out until the certificate is issued, which is normal — check back in an hour.

The `CNAME` file in this repo tells GitHub which domain to serve. Don't delete it.

---

## The tickets widget

The Events page embeds your Ticket Tailor box office, so **events appear on the website automatically when you create them in Ticket Tailor**. You don't edit this site to add an event.

The widget renders inside an iframe, which means this site's CSS can't restyle it. Change its colors and fonts in Ticket Tailor under **Box office settings → Box office design**.

If the widget ever shows nothing, get the current embed code from Ticket Tailor under **Promote → Website embed codes** and compare its `data-url` against `widgetUrl` in `src/_data/site.json`.

---

## The contact form

The Contact page has a real form, but **it needs a five-minute setup before it works.** Until then the page automatically shows an email link instead, so nothing is broken while you get to it.

This site is static — there's no server of ours to receive a form submission — so the form posts to a third-party service that emails you the message. [Formspree](https://formspree.io/) has a free tier of 50 submissions a month, which is plenty for this.

1. Sign up at [formspree.io](https://formspree.io/) using the address that should receive the messages.
2. Create a new form. Formspree gives you an endpoint URL like `https://formspree.io/f/abcdwxyz`.
3. Paste it into `formEndpoint` in `src/_data/site.json`:

```json
"formEndpoint": "https://formspree.io/f/abcdwxyz"
```

4. Commit and push. The form replaces the email fallback automatically.
5. Send yourself a test message. Formspree asks you to confirm your email on the first submission.

[Web3Forms](https://web3forms.com/) and [Getform](https://getform.io/) work the same way if you'd rather not use Formspree — any service that accepts a plain `POST` will do, since the form is standard HTML.

The form already includes a hidden honeypot field named `_gotcha`, which is the convention Formspree uses to silently discard bot submissions. Leave it in place.

To change the fields, edit `src/contact.md`. The "What's this about?" dropdown is just a list of `<option>` lines you can add to or delete.

---

## Private notes

The `.plans/` folder holds internal planning documents and is excluded from git by `.gitignore`. **Nothing in it is ever published.** Keep it that way — it contains phone numbers, venue agreements, and the internal incident response policy.

Before committing anything unfamiliar, `git status` is worth a glance. If you ever see a file listed there that shouldn't be public, don't commit it.

---

## Project layout

```
src/
  index.md, about.md, ...   the pages you edit
  _data/site.json           shared details and the nav menu
  _includes/base.njk        the page shell: header, footer, nav
  assets/css/style.css      all styling, brand colors at the top
  assets/img/logo.png       logo and favicon
  assets/photos/            put photos here
.github/workflows/deploy.yml  auto-publishing
CNAME                       the custom domain
_site/                      generated output, not committed
```

### Changing the colors

All brand colors are defined once at the top of `src/assets/css/style.css`:

```css
:root {
  --primary: #d91ea7;
  --secondary: #f2d8e4;
  --lilac: #dca9ff;
  --mauve: #bea3d9;
  --header: #404873;
  --mint: #edfacc;
  --text: #0c001f;
}
```

Change a value there and it updates everywhere. Note `--primary-ink`, a darkened pink used for links: the brand pink is too light to be readable as small text on white, so it's reserved for buttons and accents.
