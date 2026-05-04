const form = document.querySelector("#searchForm");
const input = document.querySelector("#queryInput");
const attachButton = document.querySelector("#attachButton");
const attachMenu = document.querySelector("#attachMenu");
const fileInput = document.querySelector("#fileInput");
const attachmentTray = document.querySelector("#attachmentTray");
const quickSearchRow = document.querySelector("#quickSearchRow");
const quickClear = document.querySelector("#quickClear");
const statusBox = document.querySelector("#status");
const historySection = document.querySelector("#historySection");
const historyList = document.querySelector("#historyList");
const historyClear = document.querySelector("#historyClear");
const answerSection = document.querySelector("#answerSection");
const answerText = document.querySelector("#answerText");
const providerBadge = document.querySelector("#providerBadge");
const relatedSection = document.querySelector("#relatedSection");
const relatedQuestions = document.querySelector("#relatedQuestions");
const resultsSection = document.querySelector("#resultsSection");
const resultsList = document.querySelector("#resultsList");
const resultCount = document.querySelector("#resultCount");
const cursorGlow = document.querySelector("#cursorGlow");
const attachedFiles = [];
const historyStorageKey = "smart-search-history";
const inlineFileLimit = 12 * 1024 * 1024;
const textFileTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const compactText = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const setStatus = (message, isError = false) => {
  statusBox.hidden = !message;
  statusBox.textContent = message || "";
  statusBox.style.color = isError ? "#b91c1c" : "";
};

const hideResults = () => {
  answerSection.hidden = true;
  relatedSection.hidden = true;
  resultsSection.hidden = true;
};

const buildAttachmentQuery = () => {
  if (attachedFiles.length === 0) return "";

  const names = attachedFiles.map((item) => item.file.name).join(", ");
  return `Explain the attached file${attachedFiles.length > 1 ? "s" : ""}: ${names}`;
};

const clearAttachments = () => {
  for (const item of attachedFiles) {
    URL.revokeObjectURL(item.url);
  }

  attachedFiles.length = 0;
  renderAttachments();
};

const enterSearchMode = () => {
  document.body.classList.add("has-results");
  quickSearchRow.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const readLocalHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
  } catch (error) {
    return [];
  }
};

const writeLocalHistory = (history) => {
  localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, 20)));
};

const formatHistoryTime = (createdAt) => {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) return "now";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const renderHistory = (history = readLocalHistory()) => {
  historyList.innerHTML = "";
  historySection.hidden = history.length === 0;

  for (const item of history.slice(0, 10)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.dataset.query = item.query;

    const query = document.createElement("span");
    query.textContent = item.query;

    const time = document.createElement("small");
    time.textContent = formatHistoryTime(item.createdAt);

    button.append(query, time);
    button.addEventListener("click", () => runSearch(item.query));
    historyList.appendChild(button);
  }
};

const addHistoryItem = (query) => {
  const cleanQuery = compactText(query);
  if (!cleanQuery) return;

  const history = readLocalHistory().filter(
    (item) => item.query.toLowerCase() !== cleanQuery.toLowerCase()
  );

  history.unshift({
    query: cleanQuery,
    createdAt: new Date().toISOString(),
  });

  writeLocalHistory(history);
  renderHistory(history);
};

const syncServerHistory = async () => {
  try {
    const response = await fetch("/history");
    const history = await readJsonResponse(response);

    if (!response.ok || !Array.isArray(history) || history.length === 0) {
      renderHistory();
      return;
    }

    const merged = [...readLocalHistory()];

    for (const item of history) {
      if (!item.query) continue;

      const exists = merged.some(
        (localItem) => localItem.query.toLowerCase() === item.query.toLowerCase()
      );

      if (!exists) {
        merged.push({
          query: item.query,
          createdAt: item.createdAt || new Date().toISOString(),
        });
      }
    }

    merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    writeLocalHistory(merged);
    renderHistory(merged);
  } catch (error) {
    renderHistory();
  }
};

const readTextFile = (file) =>
  new Promise((resolve) => {
    if (!textFileTypes.has(file.type) && !/\.(txt|md|csv|json)$/i.test(file.name)) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").slice(0, 4000));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });

const readDataUrl = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });

const canReadInline = (file) =>
  file.size <= inlineFileLimit &&
  (file.type === "application/pdf" || file.type.startsWith("image/"));

const buildAttachmentPayload = async (item) => {
  const file = item.file;
  const payload = {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    text: await readTextFile(file),
  };

  if (canReadInline(file)) {
    const dataUrl = await readDataUrl(file);
    const data = dataUrl.includes(",") ? dataUrl.split(",").pop() : "";

    if (data) {
      payload.inlineData = {
        mimeType: file.type,
        data,
      };
    }
  }

  return payload;
};

const readJsonResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    error:
      text.includes("<!DOCTYPE")
        ? "Server returned an HTML error page. Try a smaller file or restart the server."
        : text.slice(0, 240) || "Search failed",
  };
};

const renderAttachments = () => {
  attachmentTray.innerHTML = "";
  attachmentTray.hidden = attachedFiles.length === 0;

  for (const item of attachedFiles) {
    const chip = document.createElement("article");
    chip.className = "attachment-chip";

    const preview = document.createElement("div");
    preview.className = "attachment-preview";

    if (item.file.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = item.url;
      preview.appendChild(image);
    } else if (item.file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = item.url;
      video.muted = true;
      preview.appendChild(video);
    } else {
      preview.textContent = item.file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE";
    }

    const meta = document.createElement("div");
    meta.className = "attachment-meta";

    const name = document.createElement("strong");
    name.textContent = item.file.name;

    const size = document.createElement("span");
    size.textContent = `${item.file.type || "file"} | ${formatFileSize(item.file.size)}`;

    const remove = document.createElement("button");
    remove.className = "attachment-remove";
    remove.type = "button";
    remove.ariaLabel = `Remove ${item.file.name}`;
    remove.textContent = "x";
    remove.addEventListener("click", () => {
      URL.revokeObjectURL(item.url);
      const index = attachedFiles.indexOf(item);
      if (index >= 0) attachedFiles.splice(index, 1);
      renderAttachments();
    });

    meta.append(name, size);
    chip.append(preview, meta, remove);
    attachmentTray.appendChild(chip);
  }
};

const renderAnswer = (answer) => {
  const hasAnswer = answer?.text;

  answerSection.hidden = !hasAnswer;
  if (!hasAnswer) return;

  providerBadge.textContent = `${answer.provider} / ${answer.model}`;
  answerText.textContent = answer.text;
};

const renderRelatedQuestions = (questions) => {
  relatedQuestions.innerHTML = "";
  relatedSection.hidden = !questions?.length;

  for (const question of questions || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = question;
    button.addEventListener("click", () => runSearch(question));
    relatedQuestions.appendChild(button);
  }
};

const renderResults = (results) => {
  resultsList.innerHTML = "";
  resultsSection.hidden = !results?.length;
  resultCount.textContent = `${results?.length || 0} found`;

  for (const result of results || []) {
    const item = document.createElement("article");
    item.className = "result-item";

    const link = document.createElement("a");
    link.href = result.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = result.title;

    const description = document.createElement("p");
    description.className = "result-description";
    description.textContent = result.description;

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.textContent = `${result.source} | score ${result.score}`;

    item.append(link, description, meta);
    resultsList.appendChild(item);
  }
};

const runSearch = async (query) => {
  const cleanQuery = compactText(query) || buildAttachmentQuery();
  if (!cleanQuery) return;
  const hadAttachments = attachedFiles.length > 0;

  enterSearchMode();
  input.value = "";
  addHistoryItem(cleanQuery);
  hideResults();
  setStatus("Searching...");
  window.dispatchEvent(new CustomEvent("search-start"));

  try {
    const attachments = await Promise.all(attachedFiles.map(buildAttachmentPayload));

    const response =
      attachments.length > 0
        ? await fetch("/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ q: cleanQuery, attachments }),
          })
        : await fetch(`/search?q=${encodeURIComponent(cleanQuery)}`);
    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(data.error || "Search failed");
    }

    renderAnswer(data.answer);
    renderRelatedQuestions(data.relatedQuestions);
    renderResults(data.results);
    if (hadAttachments) clearAttachments();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Search failed", true);
  }
};

let activityTimeout;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value);
});

input.addEventListener("input", () => {
  clearTimeout(activityTimeout);
  window.dispatchEvent(new CustomEvent("ai-activity"));
  activityTimeout = setTimeout(() => {
    window.dispatchEvent(new CustomEvent("ai-activity"));
  }, 120);
});

attachButton.addEventListener("click", () => {
  const willOpen = attachMenu.hidden;
  attachMenu.hidden = !willOpen;
  attachButton.setAttribute("aria-expanded", String(willOpen));
});

for (const option of attachMenu.querySelectorAll("[data-accept]")) {
  option.addEventListener("click", () => {
    fileInput.accept = option.dataset.accept;
    attachMenu.hidden = true;
    attachButton.setAttribute("aria-expanded", "false");
    fileInput.click();
  });
}

document.addEventListener("click", (event) => {
  if (attachMenu.hidden) return;
  if (attachMenu.contains(event.target) || attachButton.contains(event.target)) return;
  attachMenu.hidden = true;
  attachButton.setAttribute("aria-expanded", "false");
});

fileInput.addEventListener("change", () => {
  for (const file of fileInput.files || []) {
    attachedFiles.push({
      file,
      url: URL.createObjectURL(file),
    });
  }

  fileInput.value = "";
  renderAttachments();
  window.dispatchEvent(new CustomEvent("ai-activity"));
});

for (const button of document.querySelectorAll("[data-query]")) {
  button.addEventListener("click", () => runSearch(button.dataset.query));
}

quickClear.addEventListener("click", () => {
  quickSearchRow.hidden = true;
});

historyClear.addEventListener("click", async () => {
  writeLocalHistory([]);
  renderHistory([]);

  await fetch("/history", {
    method: "DELETE",
  }).catch(() => null);
});

window.addEventListener("pointermove", (event) => {
  if (!cursorGlow) return;
  cursorGlow.style.setProperty("--cursor-x", `${event.clientX}px`);
  cursorGlow.style.setProperty("--cursor-y", `${event.clientY}px`);
});

const initialQuery = new URLSearchParams(window.location.search).get("q");
if (initialQuery) {
  runSearch(initialQuery);
} else {
  syncServerHistory();
}
