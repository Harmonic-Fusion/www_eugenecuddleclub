---
title: Contact
lede: Questions before an event are welcome. We'd rather talk it through in advance.
description: Get in touch with the Eugene Cuddle Club organizing team.
---

We're happy to talk through what to expect, whether this is a good fit for you, accessibility needs, childcare availability, or anything in the [code of conduct](/code-of-conduct/) you'd like clarified before booking. There's no such thing as a question that's too basic here &mdash; most people arrive at their first event having never done anything like it.

{% if site.formEndpoint %}

<form class="contact-form" action="{{ site.formEndpoint }}" method="POST">
  <div class="field">
    <label for="name">Your name</label>
    <input type="text" id="name" name="name" autocomplete="name" required />
  </div>

  <div class="field">
    <label for="email">Email address</label>
    <input type="email" id="email" name="email" autocomplete="email" required />
    <p class="field__hint">So we can write back.</p>
  </div>

  <div class="field">
    <label for="subject">What's this about?</label>
    <select id="subject" name="subject">
      <option>A question before I book</option>
      <option>Accessibility needs</option>
      <option>Childcare</option>
      <option>Ticket price or affordability</option>
      <option>Something else</option>
    </select>
  </div>

  <div class="field">
    <label for="message">Your message</label>
    <textarea id="message" name="message" rows="7" required></textarea>
  </div>

  <p class="field field--hp" aria-hidden="true">
    <label for="company">Leave this field empty</label>
    <input type="text" id="company" name="_gotcha" tabindex="-1" autocomplete="off" />
  </p>

  <button class="btn" type="submit">Send message</button>

  <p class="form-note">
    Goes straight to the organizing team. We usually reply within a couple of days.
    Prefer regular email? Write to
    <a href="mailto:{{ site.email }}">{{ site.email }}</a>.
  </p>
</form>

{% else %}

<div class="callout callout--rule">

**The contact form isn't switched on yet.** In the meantime, email works just as well:

<div class="btn-row">
  <a class="btn" href="mailto:{{ site.email }}">{{ site.email }}</a>
</div>

<small>Site admin: add your form endpoint to `formEndpoint` in `src/_data/site.json` to replace this with a real form. See the README.</small>

</div>

{% endif %}

## A few things we can help with

- **Coming alone and feeling nervous about it.** Most people do. Tell us and we'll make sure a facilitator knows to check in with you.
- **Accessibility.** Let us know what you need to participate comfortably and we'll tell you honestly what the space can and can't accommodate.
- **Childcare.** Availability varies by event, so ask ahead.
- **Affordability.** If ticket price is the barrier, say so. We'd rather you came.

## Where we meet

{{ site.venue }}. {{ site.venueNote }} It's a private home, so please don't share the address publicly once you have it.
