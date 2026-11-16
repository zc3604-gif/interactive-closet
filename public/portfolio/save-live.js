// save-live.js — shared "Save to live" client for the Zihan portfolio.
//
// Loaded as a plain (non-module) script BEFORE main.js / works.js on the
// front page and the four works pages that use works.js (NOT p5.html).
// It exposes one global, window.PortfolioSaveLive, with:
//   - loadSharedState(): fetch ./saved/state.json (the repo-committed
//     baseline for positions / wire ports / view), or null if missing.
//   - saveFiles(files, button): POST the files to the Cloudflare save
//     relay, with passphrase handling and button status UI.
//   - small helpers the page gather code uses (fetchJson, blobToBase64,
//     extForType, mimeForExt, validateCatalog, blankState).
//
// The relay URL below is the deployed Vercel save relay
// (public/portfolio/save-relay, api/save.js). The Save button posts to
// ${SAVE_RELAY_URL}/save; if the URL is ever a placeholder again,
// saveFiles() refuses to send and reports "not set up yet" instead.
// No secret ever lives in this file: the passphrase is typed by the user
// and kept only in this browser's localStorage; the GitHub token lives
// only in the Worker (see save-relay/README.md).
(function () {
  "use strict";

  // Vercel save relay (deployed from public/portfolio/save-relay):
  // bare project domain, no /api suffix — saveFiles() posts to
  // ${SAVE_RELAY_URL}/save (rewritten to /api/save by vercel.json).
  const SAVE_RELAY_URL = "https://interactive-closet.vercel.app";
  const PASSPHRASE_KEY = "portfolio-save-passphrase";
  const STATE_URL = "./saved/state.json";

  // File types the relay accepts (see save-relay/worker.js). Anything
  // else is refused client-side with a clear message, before sending.
  const TYPE_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  const EXT_TO_MIME = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
  };
  const ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov"];

  // Extension for a file, from its name first (uploads keep their
  // original name) then its MIME type. Null when neither maps to an
  // extension the relay accepts.
  function extForType(type, filename) {
    if (filename) {
      const match = /\.([A-Za-z0-9]+)$/.exec(String(filename).trim());
      if (match) {
        const ext = match[1].toLowerCase();
        if (ALLOWED_EXTS.includes(ext)) return ext;
      }
    }
    if (type) return TYPE_TO_EXT[String(type).toLowerCase()] || null;
    return null;
  }

  function mimeForExt(ext) {
    return EXT_TO_MIME[String(ext || "").toLowerCase()] || "application/octet-stream";
  }

  async function fetchJson(url) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // The repo-committed baseline for positions / wire ports / view.
  // Null when the file is missing, unreadable, or not an object — the
  // pages fall back to their hardcoded defaults in that case.
  async function loadSharedState() {
    const state = await fetchJson(STATE_URL);
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    return state;
  }

  // Empty state.json skeleton, with the same hardcoded defaults the pages
  // use (front positions from main.js, Models positions from works.js).
  // Only used when state.json does not exist yet; the save code always
  // overwrites the page it is saving from with the live values.
  function blankState() {
    return {
      version: 1,
      front: {
        positions: {
          artist: { x: -204, y: 126 },
          works: { x: 383, y: 95 },
          "3d": { x: 76, y: 427 },
          p5: { x: 164, y: 82 },
          vj: { x: 162, y: 185 },
          video: { x: 164, y: 288 },
        },
        wirePorts: {},
        view: null,
      },
      works: {
        models: {
          positions: {
            "25bbac23-d41b-4e76-9300-bc623b2cfb79": { x: -354, y: -67 },
            "0144f428-15b3-4d3c-9f71-8a5bcd6b3245": { x: -216, y: 51 },
            "f0a84f8e-317b-4c31-b803-5d4789e6f9f8": { x: -213, y: 185 },
            "9546bd75-be05-4814-bc25-9c129b03abab": { x: -219, y: 315 },
            "f2f624ea-6552-458f-8459-839c62d751ff": { x: -135, y: 492 },
          },
          wirePorts: {},
          view: null,
        },
        moving: { positions: {}, wirePorts: {}, view: null },
        vj: { positions: {}, wirePorts: {}, view: null },
        video: { positions: {}, wirePorts: {}, view: null },
        p5: { positions: {}, wirePorts: {}, view: null },
      },
    };
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // "data:<type>;base64,<data>" — the relay wants the raw base64.
        resolve(String(reader.result).split(",", 2)[1] || "");
      };
      reader.onerror = () => reject(reader.error || new Error("couldn't read file"));
      reader.readAsDataURL(blob);
    });
  }

  // Client-side mirror of the relay's catalog check (the PR #16 lesson:
  // every entry in every works store must have id, file, title, created
  // and type, or the whole page blanks). Returns an error string, or
  // null when the catalog is valid. The relay re-checks server-side.
  function validateCatalog(catalog) {
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
      return "catalog is not an object";
    }
    const works = catalog.works || {};
    if (typeof works !== "object" || Array.isArray(works)) {
      return "catalog works is not an object";
    }
    for (const [store, entries] of Object.entries(works)) {
      if (!Array.isArray(entries)) return `catalog works.${store} is not a list`;
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") {
          return `catalog works.${store} has an invalid entry`;
        }
        for (const field of ["id", "file", "title", "created", "type"]) {
          const value = entry[field];
          if (value === undefined || value === null || value === "") {
            return `catalog works.${store} entry ${entry.id || "?"} is missing ${field}`;
          }
        }
      }
    }
    return null;
  }

  // Passphrase: kept only in this browser's localStorage, never logged
  // or sent anywhere except the relay, in the POST body.
  function getPassphrase(forcePrompt) {
    if (!forcePrompt) {
      try {
        const saved = localStorage.getItem(PASSPHRASE_KEY);
        if (saved) return saved;
      } catch {}
    }
    const typed = window.prompt("Passphrase to save to the live site:");
    if (!typed) return null;
    try {
      localStorage.setItem(PASSPHRASE_KEY, typed);
    } catch {}
    return typed;
  }

  function clearPassphrase() {
    try {
      localStorage.removeItem(PASSPHRASE_KEY);
    } catch {}
  }

  async function postSave(files, passphrase) {
    const response = await fetch(`${SAVE_RELAY_URL}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase, files }),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, ok: response.ok, data };
  }

  // Send files to the relay and drive the button's status text.
  // files: [{ path, encoding: "utf-8" | "base64", content }].
  // On HTTP 401 the stored passphrase is cleared and the user is
  // prompted once more before retrying. Whenever a save does not
  // succeed — failed retry, any other non-ok result, or a network
  // failure — the stored passphrase is cleared too, so the next
  // click always asks for it fresh instead of silently reusing a
  // phrase that already failed. A successful save keeps it stored.
  async function saveFiles(files, button) {
    const setLabel = (text) => {
      if (button) button.textContent = text;
    };
    const setBusy = (busy) => {
      if (button) button.disabled = busy;
    };
    if (!SAVE_RELAY_URL || SAVE_RELAY_URL.includes("REPLACE-ME")) {
      setLabel("Save relay not set up yet");
      return { ok: false, error: "relay URL is still a placeholder" };
    }
    if (!files || !files.length) {
      setLabel("Nothing new to save");
      return { ok: false, error: "no files to save" };
    }
    const passphrase = getPassphrase(false);
    if (!passphrase) {
      setLabel("Save to live");
      return { ok: false, error: "no passphrase given" };
    }
    setBusy(true);
    setLabel("Saving…");
    try {
      let result = await postSave(files, passphrase);
      if (result.status === 401) {
        clearPassphrase();
        const retryPassphrase = getPassphrase(true);
        if (!retryPassphrase) {
          setLabel("Save to live");
          setBusy(false);
          return { ok: false, error: "no passphrase given" };
        }
        result = await postSave(files, retryPassphrase);
        // A failed retry must not leave its phrase stored: the next
        // click must ask fresh instead of silently reusing it.
        if (result.status === 401) clearPassphrase();
      }
      if (result.ok && result.data && result.data.ok) {
        const time = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        setLabel(`Saved ✓ ${time}`);
        if (button && result.data.commit) {
          button.title = `Saved as commit ${result.data.commit}`;
        }
        setBusy(false);
        return { ok: true, commit: result.data.commit };
      }
      const message =
        (result.data && result.data.error) || `save failed (HTTP ${result.status})`;
      // Any failed save clears the stored phrase so the next click
      // always asks for it fresh.
      clearPassphrase();
      setLabel(result.status === 401 ? "Save failed — wrong passphrase" : "Save failed — try again");
      setBusy(false);
      return { ok: false, error: message };
    } catch (error) {
      // A network failure must not leave a possibly-wrong phrase
      // stored either: the next click asks fresh.
      clearPassphrase();
      setLabel("Save failed — try again");
      setBusy(false);
      return { ok: false, error: String((error && error.message) || error) };
    }
  }

  window.PortfolioSaveLive = {
    SAVE_RELAY_URL,
    loadSharedState,
    fetchJson,
    getPassphrase,
    clearPassphrase,
    blobToBase64,
    extForType,
    mimeForExt,
    validateCatalog,
    blankState,
    saveFiles,
  };
})();
