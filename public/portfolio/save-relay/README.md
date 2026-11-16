# Save to live — Cloudflare relay

The portfolio is a static GitHub Pages site: the browser cannot write
back to the repo on its own. This Worker is the small relay that does
it. The page's **Save to live** button (`public/portfolio/save-live.js`)
POSTs the changed files here, and the Worker commits them to GitHub
with the git data API as a single commit.

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

## Setup

1. **Create the Worker.** In the Cloudflare dashboard go to
   Workers & Pages → Create → Worker, name it e.g.
   `portfolio-save-relay`, delete the starter code, paste in
   `worker.js`, and deploy.
2. **Set the secrets** (Settings → Variables → Secrets, or
   `wrangler secret put`):
   - `GITHUB_TOKEN` — a GitHub **fine-grained** personal access token:
     repository access = only `zc3604-gif/interactive-closet`,
     permissions = **Contents: Read and write**. Nothing else.
   - `SAVE_PASSPHRASE` — any passphrase you choose. The user types it
     once in the browser; the page remembers it in that browser only.
     Pick something long and unguessable — it is the only thing
     standing between the public site and a write to the repo.
3. **Set the variables** (Settings → Variables):
   - `REPO` = `zc3604-gif/interactive-closet`
   - `BRANCH` = the test branch name while testing (e.g.
     `muse-test-direct-save`), then `main` for the live site.
4. **Put the Worker URL into the page.** In
   `public/portfolio/save-live.js`, replace the `REPLACE-ME` placeholder
   in `SAVE_RELAY_URL` with the Worker's real URL
   (`https://portfolio-save-relay.<your-subdomain>.workers.dev`),
   commit, and merge. Until that is done the Save button reports
   "Save relay not set up yet" and sends nothing.
5. **Test on the test branch first.** With `BRANCH` set to the test
   branch: open the test preview, move something, click **Save to live**,
   enter the passphrase, and check the commit lands on the test branch
   (and that the live site is untouched). Only then switch `BRANCH` to
   `main`.

## Security notes

- The GitHub token **never** appears in page JavaScript, the repo, or
  any response. It lives only as a Worker secret.
- The passphrase is checked with a timing-safe compare and is never
  logged or returned. A wrong passphrase gets a bare 401.
- **Origin allowlist:** the Worker only answers CORS for
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
- **Catalog validation:** if `catalog.json` is in the save, the Worker
  refuses it unless every entry in every works store has a non-empty
  `id`, `file`, `title`, `created`, and `type`. (This is the PR #16
  lesson: one entry without `type` blanked the whole Moving Image page.)
- **Size limits:** 10 MB per file, 20 MB total per save.
- **One commit per save**, via the git data API (blobs → tree → commit
  → ref update, no force). If the ref moved since the base was read
  (non-fast-forward), the whole sequence is retried once.

## Rotating the passphrase / token

- **Passphrase:** change `SAVE_PASSPHRASE` in the Worker settings.
  The page will get a 401 on the next save, forget the stored
  passphrase, and prompt for the new one. No repo change is needed.
- **GitHub token:** create a new fine-grained token with the same
  scope, replace the `GITHUB_TOKEN` secret, then revoke the old token
  on GitHub. No repo change is needed.
- If either secret is ever exposed, rotate it immediately and check the
  repo's recent commits for anything unexpected.
