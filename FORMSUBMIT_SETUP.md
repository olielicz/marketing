# One-time setup: fully masking the contact-form destination

The contact form (`contact/index.html`) and every "email us" link across the
site now render the real support address at runtime via
`shared/contact-email.js`, instead of storing it as plaintext in any HTML
file. That already stops simple text/regex scrapers and keeps the address
out of `grep`-able page source and git-diff review tools.

There is **one further step you can take** to remove the real address from
this repo's source entirely, including from `shared/contact-email.js`
itself — FormSubmit.co (the free service the contact form posts to) issues
a **hash** you can use in place of the raw email in the form's `action=`
URL.

## Steps (5 minutes, one time)

1. Make sure the live contact page is deployed and reachable (or open
   `contact/index.html` locally).
2. Submit the form once for real, with a real message.
3. FormSubmit.co will email a one-time confirmation link to
   `workitlikeapr01@gmail.com`. Open that email and click "Confirm".
4. FormSubmit's confirmation email / dashboard will show you a **hash**
   that looks like `c277d8d5f1e7209149848e390b9b5cc`. Copy it.
5. Open `shared/contact-email.js` and paste it into the
   `FORMSUBMIT_HASH` constant:
   ```js
   var FORMSUBMIT_HASH = 'c277d8d5f1e7209149848e390b9b5cc';
   ```
6. Commit that one-line change. From then on, the contact form's `action=`
   URL uses the hash instead of the real address — the real email is only
   still reconstructed for the "email us" links shown on the contact page
   itself (see below if you'd also like to remove those).

## Optional: remove the visible "email us" links too

If you'd rather not show a clickable "email us" link at all and rely only
on the form, you can delete the five `<a data-oli-email-link>` elements in
`contact/index.html`'s route cards — the form alone is enough for visitors
to reach you, and removing the links means `shared/contact-email.js` no
longer needs to reconstruct the real address for anything once the
FormSubmit hash is set.

## Honest limitation

No client-side technique can make an email address 100% unreadable to a
human who deliberately inspects the page with browser DevTools — the
browser has to know the real address to send the mail via `mailto:`, or
FormSubmit has to know it to deliver the form (unless you use the hash,
which removes it from *this repo* but FormSubmit's own servers still know
where to deliver mail). What this setup *does* achieve: the address is no
longer visible in plain page source, no longer directly `grep`-able across
the repo, and no longer picked up by simple automated scrapers that only
read static HTML/JS text.
