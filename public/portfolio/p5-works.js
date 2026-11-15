const grid = document.querySelector("#works");
const input = document.querySelector(".add-work input");
const urls = new Set();

function openWorksDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("portfolio-works", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["p5", "models", "vj", "video", "moving"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const db = await openWorksDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction("p5", mode);
    const request = run(tx.objectStore("p5"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function workTitle(file) {
  const name = file.name.replace(/\.[^.]+$/, "").trim();
  return name || "Untitled";
}

function render(works) {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  grid.replaceChildren();
  if (!works.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No works yet. Use + add a work.";
    grid.append(empty);
    return;
  }
  for (const work of works) {
    const card = document.createElement("article");
    card.className = "work";
    const frame = document.createElement("div");
    frame.className = "frame";
    const media = document.createElement(work.type.startsWith("video/") ? "video" : "img");
    const url = URL.createObjectURL(work.blob);
    urls.add(url);
    media.src = url;
    media.alt = work.title;
    if (media.tagName === "VIDEO") {
      media.controls = true;
      media.loop = true;
      media.muted = true;
      media.playsInline = true;
    }
    frame.append(media);
    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("p");
    title.className = "title";
    title.contentEditable = "true";
    title.spellcheck = false;
    title.textContent = work.title;
    title.addEventListener("blur", async () => {
      const next = title.textContent.trim() || "Untitled";
      title.textContent = next;
      work.title = next;
      await withStore("readwrite", (store) => store.put(work));
    });
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        title.blur();
      }
    });
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${work.title}`);
    remove.addEventListener("click", async () => {
      await withStore("readwrite", (store) => store.delete(work.id));
      await showWorks();
    });
    meta.append(title, remove);
    card.append(frame, meta);
    grid.append(card);
  }
}

async function showWorks() {
  const works = await withStore("readonly", (store) => store.getAll());
  works.sort((a, b) => b.created - a.created);
  render(works);
}

input.addEventListener("change", async () => {
  const files = [...(input.files || [])];
  input.value = "";
  if (!files.length) return;
  const db = await openWorksDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("p5", "readwrite");
    const store = tx.objectStore("p5");
    for (const file of files) {
      store.put({
        id: crypto.randomUUID(),
        title: workTitle(file),
        type: file.type || "application/octet-stream",
        blob: file,
        created: Date.now(),
      });
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await showWorks();
});

showWorks();
