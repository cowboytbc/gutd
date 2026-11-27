# GIVE US THIS DAY website

The website uses the same Supabase band membership, chat, calendar, and private storage as the Windows app. The existing project must have the desktop app's Supabase migrations installed, including the access-request and chat-attachment migrations; those unpublished desktop migration files are not included in this website branch. Email sign-in and signup must be enabled in Supabase; leave **Confirm email** off for the in-app approval flow.

New users request access after creating an account. Any existing member can approve or decline a request. Names and email addresses are not verified; confirm applicants another way before approving.

Vault images, supported audio and video, text files, and PDFs open in the site. Browser codecs and PDF support vary by device; other file types must be downloaded. Files are limited to 50 MB each. The site needs an internet connection and does not cache private band data for offline use.

## Local development

From `web`, run `npm ci`, `npm test`, and `npm run dev`. The Supabase URL and publishable client key are public by design; never add a service-role key or other secret to the website.

## GitHub Pages

The `band-website` branch deploys via `.github/workflows/deploy-website.yml` when its website files change. In the repository settings, Pages must use **GitHub Actions** as its source. After deployment, open the Pages URL on a phone and use the browser's **Add to Home Screen** option.
