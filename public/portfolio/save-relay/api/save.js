// api/save.js — "Save to live" relay for the Zihan portfolio, as a
// Vercel Node Serverless Function (no dependencies, Node built-ins +
// global fetch only).
//
// This is a faithful port of the Cloudflare Worker in ../worker.js
// (now legacy — see ../README.md). Only the entry-point adapter
// changed: the Worker answered `fetch(request, env)` and returned
// Response objects; this function answers Vercel's `handler(req, res)`
// and reads config from process.env. All pure logic — CORS allowlist,
// timing-safe passphrase compare, path allowlist, catalog validation,
// and the GitHub git-data-API commit sequence — is identical.
//
// Vercel project setup (see ../README.md):
//   Root Directory = public/portfolio/save-relay, so this file is
//   served at /api/save on the project domain. A rewrite in
//   vercel.json also maps /save -> /api/save, because the page client
//   (public/portfolio/save-live.js) POSTs to `${SAVE_RELAY_URL}/save`
//   and SAVE_RELAY_URL is the bare project domain.
//
//   GET  /api/save  health check, no auth:
//                    { ok: true, service: "portfolio-save-relay" }
//   POST /api/save  commit files to the repo (see below)
//                    (POST /save works too, via the rewrite)
//
// Environment (set in the Vercel dashboard, never in this repo):
//   Secrets (encrypted, never logged or returned):
//     GITHUB_TOKEN    fine-grained PAT, contents: write, this repo only.
//     SAVE_PASSPHRASE shared passphrase the page asks the user for.
//   Variables:
//     REPO   "zc3604-gif/interactive-closet" (default if unset)
//     BRANCH "main" for live, or a test branch name while testing.
//
// Request body: { passphrase: string, files: [{ path, encoding, content }] }
//   path     repo-relative, allowlisted (see validPath) — only files
//            under public/portfolio/saved/ may ever be written.
//   encoding "utf-8" for text files, "base64" for images/video.
//   content  the file contents as a string in that encoding.
// Vercel auto-parses a JSON body, so req.body is normally already an
// object; a string body is parsed here too, and a missing or
// unparseable body is a 400.
//
// Response: { ok: true, commit: "<sha>" } on success, or
// { ok: false, error: "<plain message>" } with 401 (bad passphrase),
// 400 (bad payload), or 502 (GitHub failure). No secret ever appears
// in a response, log, or error message.
//
// Platform limit to know about: Vercel Serverless Functions reject
// request bodies over ~4.5 MB, so the effective wire limit is ~4.5 MB
// even though the function's own decoded-size limits below are
// 10 MB/file and 20 MB total. The largest current image
// (Magzine_Cover2, 3,020,630 bytes -> ~4.03 MB base64 + JSON, ~4.1 MB
// on the wire) fits, but a bigger future image would fail at the
// platform level with a 413 before this function ever runs.

const ALLOWED_ORIGINS = [
  "https://zc3604-gif.github.io",
  "https://raw.githack.com",
];
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // whole request
const MAX_FILE_BYTES = 10 * 1024 * 1024; // per file
const WORK_STORES = ["models", "moving", "vj", "video", "p5"];
const ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// CORS: reflect the Origin header only when it is allowlisted, so the
// relay cannot be driven from any other site. Non-allowlisted origins
// get no CORS headers at all (the browser then blocks reading the reply).
function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

// Vercel (Node) response adapter: same JSON shape and status codes as
// the Worker's jsonResponse(), written through res instead.
function sendJson(res, status, body, origin) {
  const headers = { "Content-Type": "application/json", ...corsHeaders(origin) };
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.status(status).json(body);
}

// Constant-time string compare, so a wrong passphrase does not leak
// how many leading characters were right.
function timingSafeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Only files under public/portfolio/saved/ may be written, and only:
//   - public/portfolio/saved/state.json
//   - public/portfolio/saved/catalog.json
//   - public/portfolio/saved/<store>/<uuid>.<ext>, store in WORK_STORES
//   - public/portfolio/saved/modules/artist.<ext> (front-page artist
//     module cover; one fixed filename, extension allowlisted)
// Anything with "..", a leading "/", a backslash, or any other path is
// rejected, so a crafted request can never write outside saved/ or
// overwrite code (main.js, works.js, HTML) in the repo.
function validPath(path) {
  if (typeof path !== "string") return false;
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  if (path === "public/portfolio/saved/state.json") return true;
  if (path === "public/portfolio/saved/catalog.json") return true;
  const match = /^public\/portfolio\/saved\/([^/]+)\/([^/]+)$/.exec(path);
  if (!match) return false;
  const [, dir, name] = match;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  const base = name.slice(0, dot);
  const ext = name.slice(dot + 1).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) return false;
  if (dir === "modules") return base === "artist";
  if (!WORK_STORES.includes(dir)) return false;
  return UUID_RE.test(base);
}

function decodedSize(file) {
  if (file.encoding === "base64") {
    return Math.floor((file.content.length * 3) / 4);
  }
  return new TextEncoder().encode(file.content).length;
}

function decodeText(file) {
  if (file.encoding === "base64") {
    const binary = atob(file.content);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return file.content;
}

// The PR #16 lesson, enforced server-side: every entry in every works
// store must have a non-empty id, file, title, created and type, or a
// missing type crashes the whole page render. Refuse the save otherwise.
// (catalog.modules entries are the front-page tiles, which have no
// title/created by design, so they are only checked for id/file/type.)
function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return "catalog.json is not a JSON object";
  }
  const works = catalog.works || {};
  if (typeof works !== "object" || Array.isArray(works)) {
    return "catalog.json works is not an object";
  }
  for (const [store, entries] of Object.entries(works)) {
    if (!Array.isArray(entries)) return `catalog.json works.${store} is not a list`;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        return `catalog.json works.${store} has an invalid entry`;
      }
      for (const field of ["id", "file", "title", "created", "type"]) {
        const value = entry[field];
        if (value === undefined || value === null || value === "") {
          return `catalog.json works.${store} entry ${entry.id || "?"} is missing ${field}`;
        }
      }
    }
  }
  if (catalog.modules !== undefined) {
    if (!Array.isArray(catalog.modules)) return "catalog.json modules is not a list";
    for (const entry of catalog.modules) {
      if (!entry || typeof entry !== "object") return "catalog.json modules has an invalid entry";
      for (const field of ["id", "file", "type"]) {
        const value = entry[field];
        if (value === undefined || value === null || value === "") {
          return `catalog.json modules entry ${entry.id || "?"} is missing ${field}`;
        }
      }
    }
  }
  return null;
}

async function github(env, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "portfolio-save-relay",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

// One commit through the git data API: read the branch ref, create a
// blob per file, a tree on the base commit's tree, a commit, then move
// the ref (no force). Throws an Error with .retryable = true when the
// ref update fails with 422 (non-fast-forward: someone else committed
// since we read the base), so the caller can re-read the base and retry
// the whole sequence once.
async function commitFiles(env, files) {
  const repo = env.REPO || "zc3604-gif/interactive-closet";
  const branch = env.BRANCH || "main";
  const ref = await github(env, "GET", `/repos/${repo}/git/ref/heads/${branch}`);
  if (!ref.response.ok) throw new Error("github_ref");
  const baseSha = ref.data.object.sha;
  const baseCommit = await github(env, "GET", `/repos/${repo}/git/commits/${baseSha}`);
  if (!baseCommit.response.ok) throw new Error("github_commit");
  const baseTree = baseCommit.data.tree.sha;

  const tree = [];
  for (const file of files) {
    const blob = await github(env, "POST", `/repos/${repo}/git/blobs`, {
      content: file.content,
      encoding: file.encoding,
    });
    if (!blob.response.ok) throw new Error("github_blob");
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.data.sha });
  }

  const newTree = await github(env, "POST", `/repos/${repo}/git/trees`, {
    base_tree: baseTree,
    tree,
  });
  if (!newTree.response.ok) throw new Error("github_tree");

  const newCommit = await github(env, "POST", `/repos/${repo}/git/commits`, {
    message: `Save from live site ${new Date().toISOString()}`,
    tree: newTree.data.sha,
    parents: [baseSha],
  });
  if (!newCommit.response.ok) throw new Error("github_commit_create");

  const update = await github(env, "PATCH", `/repos/${repo}/git/ref/heads/${branch}`, {
    sha: newCommit.data.sha,
    force: false,
  });
  if (!update.response.ok) {
    const error = new Error("github_ref_update");
    error.retryable = update.response.status === 422;
    throw error;
  }
  return newCommit.data.sha;
}

export default async function handler(req, res) {
  // Vercel env vars (set in the dashboard, never in this repo).
  const env = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    SAVE_PASSPHRASE: process.env.SAVE_PASSPHRASE,
    REPO: process.env.REPO,
    BRANCH: process.env.BRANCH,
  };
  const origin = (req.headers && req.headers.origin) || "";
  const pathname = new URL(req.url || "/api/save", "http://localhost").pathname;

  if (req.method === "OPTIONS") {
    for (const [name, value] of Object.entries(corsHeaders(origin))) {
      res.setHeader(name, value);
    }
    res.status(204).end();
    return;
  }
  // Both /api/save (the function's own path) and /save (via the
  // vercel.json rewrite) answer the same way.
  const isSavePath = pathname === "/api/save" || pathname === "/save";
  if (req.method === "GET" && isSavePath) {
    sendJson(res, 200, { ok: true, service: "portfolio-save-relay" }, origin);
    return;
  }
  if (req.method !== "POST" || !isSavePath) {
    sendJson(res, 404, { ok: false, error: "not found" }, origin);
    return;
  }

  // (a) The body must parse as JSON. Vercel auto-parses a JSON body
  // into req.body (an object); a string body is parsed here, and a
  // missing body is a 400, as in the Worker (request.json() throws).
  let body = req.body;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) {
    body = body.toString("utf8");
  }
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      sendJson(res, 400, { ok: false, error: "request body is not valid JSON" }, origin);
      return;
    }
  }
  if (body === undefined || body === null) {
    sendJson(res, 400, { ok: false, error: "request body is not valid JSON" }, origin);
    return;
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    sendJson(res, 400, { ok: false, error: "request body must be a JSON object" }, origin);
    return;
  }

  // (b) Passphrase gate. Fails closed when the secret is not configured.
  if (
    typeof body.passphrase !== "string" ||
    !env.SAVE_PASSPHRASE ||
    !timingSafeEqual(body.passphrase, env.SAVE_PASSPHRASE)
  ) {
    sendJson(res, 401, { ok: false, error: "bad passphrase" }, origin);
    return;
  }

  // (c) Files list and size limits.
  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    sendJson(res, 400, { ok: false, error: "files must be a non-empty list" }, origin);
    return;
  }
  let totalBytes = 0;
  for (const file of files) {
    if (!file || typeof file !== "object") {
      sendJson(res, 400, { ok: false, error: "each file must be an object" }, origin);
      return;
    }
    if (file.encoding !== "utf-8" && file.encoding !== "base64") {
      sendJson(res, 400, { ok: false, error: "file encoding must be utf-8 or base64" }, origin);
      return;
    }
    if (typeof file.content !== "string") {
      sendJson(res, 400, { ok: false, error: "file content must be a string" }, origin);
      return;
    }
    if (!validPath(file.path)) {
      sendJson(res, 400, { ok: false, error: `file path not allowed: ${file.path}` }, origin);
      return;
    }
    const size = decodedSize(file);
    if (size > MAX_FILE_BYTES) {
      sendJson(res, 400, { ok: false, error: `file too large: ${file.path}` }, origin);
      return;
    }
    totalBytes += size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    sendJson(res, 400, { ok: false, error: "total payload too large (max 20MB)" }, origin);
    return;
  }

  // (e) If catalog.json is among the files, it must parse and every
  // works entry must have id, file, title, created and type.
  const catalogFile = files.find((file) => file.path === "public/portfolio/saved/catalog.json");
  if (catalogFile) {
    let catalog;
    try {
      catalog = JSON.parse(decodeText(catalogFile));
    } catch {
      sendJson(res, 400, { ok: false, error: "catalog.json is not valid JSON" }, origin);
      return;
    }
    const catalogError = validateCatalog(catalog);
    if (catalogError) {
      sendJson(res, 400, { ok: false, error: catalogError }, origin);
      return;
    }
  }

  // (f) Commit as ONE commit via the GitHub git data API. Retry the
  // whole sequence once on a non-fast-forward ref update.
  try {
    const sha = await commitFiles(env, files);
    sendJson(res, 200, { ok: true, commit: sha }, origin);
    return;
  } catch (error) {
    if (error && error.retryable) {
      try {
        const sha = await commitFiles(env, files);
        sendJson(res, 200, { ok: true, commit: sha }, origin);
        return;
      } catch {
        // Fall through to the generic GitHub failure below.
      }
    }
    sendJson(res, 502, { ok: false, error: "couldn't save to GitHub — try again" }, origin);
    return;
  }
}
