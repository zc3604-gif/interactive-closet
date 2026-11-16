# Save to live — Vercel relay (active)

The portfolio is a static GitHub Pages site: the browser cannot write
back to the repo on its own. This relay is the small server that does
it. The page's **Save to live** button (`public/portfolio/save-live.js`)
POSTs the changed files here, and the relay commits them to GitHub
with the git data API as a single commit.

The relay is a **Vercel Serverless Function**: `api/save.js` in this
directory (no dependencies — Node built-ins + global `fetch` only).
It is a faithful port of the Cloudflare Worker in `worker.js`; only
the entry-point adapter changed (Vercel `handler(req, res)` instead
of the Worker's `fetch(request, env)`, config from `process.env`).
All validation, CORS, and commit logic is identical.

## Status: Cloudflare superseded

The Cloudflare Worker (`worker.js`) was the first relay, but
Cloudflare is **no longer the active relay**: sign-up got stuck on the
"Just a moment..." bot check in the Muse browser (never cleared after
refresh, or after the user took over the browser), and Google SSO +
GitHub SSO login to Cloudflare also failed ("Unable to sign in").
`worker.js` is kept in the repo as a legacy reference only — do not
deploy it, and do not point the site at it.

## Setup (Vercel)

1. **Import the project.** In the Vercel dashboard: Add New →
   Project → Import the GitHub repo `zc3604-gif/interactive-closet`.
   (GitHub SSO sign-in is already working, unlike Cloudflare.)
2. **Set the Root Directory** to `public/portfolio/save-relay`
   (Project Settings → General → Root Directory, or during import).
   This directory is the whole Vercel project: `api/save.js` becomes
   the function at `/api/save`, `vercel.json` supplies the rewrite,
   and `package.json` (`{"type": "module"}`) is what lets `api/save.js`
   use `export default` — without it Vercel would treat the file as
   CommonJS and the function would fail to load.
3. **Set the environment variables** (Project Settings → Environment
   Variables). Secrets are encrypted; never put them in the repo:
   - `GITHUB_TOKEN` (secret) — the GitHub **fine-grained** personal
     access token named `portfolio-save-relay`: repository access =
     only `zc3604-gif/interactive-closet`, permissions = **Contents:
     Read and write**. Nothing else. (Token already created
     2026-11-16, expires 2027-11-16.)
   - `SAVE_PASSPHRASE` (secret) — any passphrase you choose. The user
     types it once in the browser; the page remembers it in that
     browser only. Pick something long and unguessable — it is the
     only thing standing between the public site and a write to the
     repo. (Passphrase already chosen; it is never written in the repo
     or any report.)
   - `REPO` = `zc3604-gif/interactive-closet`
   - `BRANCH` = the test branch name while testing (e.g.
     `muse-test-direct-save`), then `main` for the live site.
4. **Deploy**, then note the project URL, e.g.
   `https://portfolio-save-relay.vercel.app` (or whatever name you
   pick at import). The function lives at
   `https://<project>.vercel.app/api/save`.
5. **Put the relay URL into the page.** In
   `public/portfolio/save-live.js`, replace the `REPLACE-ME`
   placeholder in `SAVE_RELAY_URL` with the bare project domain
   (`https://<project>.vercel.app` — no `/api` suffix), commit, and
   merge. The page POSTs to `${SAVE_RELAY_URL}/save`; a rewrite in
   `vercel.json` maps `/save` → `/api/save`, so the bare domain is
   all the page needs. (Hitting `/api/save` directly works too.)
   Until that is done the Save button reports "Save relay not set up
   yet" and sends nothing.
6. **Test on the test branch first.** With `BRANCH` set to the test
   branch: open the test preview, move something, click **Save to
   live**, enter the passphrase, and check the commit lands on the
   test branch (and that the live site is untouched). Only then
   switch `BRANCH` to `main`. You can also health-check the function
   directly: `GET https://<project>.vercel.app/api/save` should
   return `{"ok": true, "service": "portfolio-save-relay"}`.

What the button saves, per page:

- **Front page** — module positions, wire-port positions, view
  (zoom/pan) into `saved/state.json`; if the artist module has a
  locally uploaded cover, that image plus the updated `saved/catalog.json`
  modules entry.
- **Works pages** (Models / Moving image / VJ / Fine art) — that store's
  positions, wire ports and view into `saved/state.json`, plus an updated
  `saved/catalog.json`: renames applied, hidden works (× on a saved work)
  removed, local-only uploads added as new entries with their image/video
  file. Image files already in the repo are left in place.

## Security notes

- The GitHub token **never** appears in page JavaScript, the repo, or
  any response. It lives only as a Vercel environment variable.
- The passphrase is checked with a timing-safe compare and is never
  logged or returned. A wrong passphrase gets a bare 401.
- **Origin allowlist:** the relay only answers CORS for
  `https://zc3604-gif.github.io` (the live site) and
  `https://raw.githack.com` (test previews). Other origins get no CORS
  headers, so a browser on another site cannot read a response.
- **Path allowlist:** only files under `public/portfolio/saved/` can be
  written, and only `state.json`, `catalog.json`,
  `saved/<store>/<uuid>.<ext>` (stores: models, moving, vj, video, p5;
  extensions: jpg, jpeg, png, gif, webp, mp4, mov), and the single
  front-page cover `saved/modules/artist.<ext>`. Paths with `..`,
  leading `/`, or anything else are rejected — a crafted request cannot
  overwrite site code.
- **Catalog validation:** if `catalog.json` is in the save, the relay
  refuses it unless every entry in every works store has a non-empty
  `id`, `file`, `title`, `created`, and `type`. (This is the PR #16
  lesson: one entry without `type` blanked the whole Moving Image page.)
- **Size limits:** 10 MB per file, 20 MB total per save — **but see
  the platform limit below**, which bites first.
- **One commit per save**, via the git data API (blobs → tree → commit
  → ref update, no force). If the ref moved since the base was read
  (non-fast-forward), the whole sequence is retried once.

## Platform limit: ~4.5 MB request bodies on Vercel

Vercel Serverless Functions reject request bodies over ~4.5 MB, so
the effective wire limit is **~4.5 MB per save**, even though the
function's own decoded-size limits are 10 MB/file and 20 MB total.
A save bigger than that fails at the platform level with a **413
before the function ever runs** — the page will report "Save failed —
try again" with no relay-side error to inspect.

The largest current image fits, but only just: `Magzine_Cover2`
(3,020,630 bytes) becomes ~4.03 MB as base64, plus the JSON around
it ≈ **4.1 MB on the wire**. A single save carrying a bigger future
image (or several large images at once) would exceed 4.5 MB and fail.
If that happens, the fix is to save the image on its own first (or
shrink it) — the relay itself cannot raise Vercel's body limit.

## Rotating the passphrase / token

- **Passphrase:** change `SAVE_PASSPHRASE` in the Vercel project
  settings, then redeploy (or wait for the next deployment — env
  changes apply to new deployments). The page will get a 401 on the
  next save, forget the stored passphrase, and prompt for the new one.
  No repo change is needed.
- **GitHub token:** create a new fine-grained token with the same
  scope, replace the `GITHUB_TOKEN` variable, then revoke the old
  token on GitHub. No repo change is needed.
- If either secret is ever exposed, rotate it immediately and check the
  repo's recent commits for anything unexpected.
