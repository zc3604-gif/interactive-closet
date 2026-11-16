// worker.js — "Save to live" relay for the Zihan portfolio.
//
// Cloudflare Worker, no dependencies. It lets the static GitHub Pages
// site save changes back to the repo: the page POSTs its changed files,
// the Worker commits them to GitHub with the git data API.
//
//   GET  /      health check, no auth: { ok: true, service: "portfolio-save-relay" }
//   POST /save  commit files to the repo (see below)
//
// Environment (set in the Cloudflare dashboard, never in this repo):
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
//
// Response: { ok: true, commit: "<sha>" } on success, or
// { ok: false, error: "<plain message>" } with 401 (bad passphrase),
// 400 (bad payload), or 502 (GitHub failure). No secret ever appears
// in a response, log, or error message.

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

function jsonResponse(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
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

export default {
  async fetch(request, env, _ctx) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse(200, { ok: true, service: "portfolio-save-relay" }, origin);
    }
    if (request.method !== "POST" || url.pathname !== "/save") {
      return jsonResponse(404, { ok: false, error: "not found" }, origin);
    }

    // (a) The body must parse as JSON.
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { ok: false, error: "request body is not valid JSON" }, origin);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(400, { ok: false, error: "request body must be a JSON object" }, origin);
    }

    // (b) Passphrase gate. Fails closed when the secret is not configured.
    if (
      typeof body.passphrase !== "string" ||
      !env.SAVE_PASSPHRASE ||
      !timingSafeEqual(body.passphrase, env.SAVE_PASSPHRASE)
    ) {
      return jsonResponse(401, { ok: false, error: "bad passphrase" }, origin);
    }

    // (c) Files list and size limits.
    const files = body.files;
    if (!Array.isArray(files) || files.length === 0) {
      return jsonResponse(400, { ok: false, error: "files must be a non-empty list" }, origin);
    }
    let totalBytes = 0;
    for (const file of files) {
      if (!file || typeof file !== "object") {
        return jsonResponse(400, { ok: false, error: "each file must be an object" }, origin);
      }
      if (file.encoding !== "utf-8" && file.encoding !== "base64") {
        return jsonResponse(400, { ok: false, error: "file encoding must be utf-8 or base64" }, origin);
      }
      if (typeof file.content !== "string") {
        return jsonResponse(400, { ok: false, error: "file content must be a string" }, origin);
      }
      if (!validPath(file.path)) {
        return jsonResponse(400, { ok: false, error: `file path not allowed: ${file.path}` }, origin);
      }
      const size = decodedSize(file);
      if (size > MAX_FILE_BYTES) {
        return jsonResponse(400, { ok: false, error: `file too large: ${file.path}` }, origin);
      }
      totalBytes += size;
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonResponse(400, { ok: false, error: "total payload too large (max 20MB)" }, origin);
    }

    // (e) If catalog.json is among the files, it must parse and every
    // works entry must have id, file, title, created and type.
    const catalogFile = files.find((file) => file.path === "public/portfolio/saved/catalog.json");
    if (catalogFile) {
      let catalog;
      try {
        catalog = JSON.parse(decodeText(catalogFile));
      } catch {
        return jsonResponse(400, { ok: false, error: "catalog.json is not valid JSON" }, origin);
      }
      const catalogError = validateCatalog(catalog);
      if (catalogError) {
        return jsonResponse(400, { ok: false, error: catalogError }, origin);
      }
    }

    // (f) Commit as ONE commit via the GitHub git data API. Retry the
    // whole sequence once on a non-fast-forward ref update.
    try {
      const sha = await commitFiles(env, files);
      return jsonResponse(200, { ok: true, commit: sha }, origin);
    } catch (error) {
      if (error && error.retryable) {
        try {
          const sha = await commitFiles(env, files);
          return jsonResponse(200, { ok: true, commit: sha }, origin);
        } catch {
          // Fall through to the generic GitHub failure below.
        }
      }
      return jsonResponse(502, { ok: false, error: "couldn't save to GitHub — try again" }, origin);
    }
  },
};
