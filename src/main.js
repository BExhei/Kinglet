import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile, writeTextFile, watch } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import markedFootnote from "marked-footnote";
// 按需注册语言：lib/common 有 40 种语言（gzip +56KB），这里只留技术文档常见的，
// 体积减半。每个语言模块自带别名（javascript 含 js/jsx/mjs 等）。
import hljs from "highlight.js/lib/core";
import katex from "katex";
import "katex/dist/katex.min.css";
import STRINGS from "./strings.js";
const APP_VERSION = "1.0.1";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import cssLang from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLang from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

[
  ["bash", bash], ["c", c], ["cpp", cpp], ["css", cssLang], ["diff", diff],
  ["go", go], ["ini", ini], ["java", java], ["javascript", javascript],
  ["json", json], ["markdown", markdownLang], ["plaintext", plaintext],
  ["powershell", powershell], ["python", python], ["rust", rust],
  ["sql", sql], ["typescript", typescript], ["xml", xml], ["yaml", yaml],
].forEach(([name, lang]) => hljs.registerLanguage(name, lang));
import DOMPurify from "dompurify";

// ============================================================
// Markdown rendering
// ============================================================


marked.use(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        return code;
      }
    },
  })
);

// 脚注：marked 原生不支持 [^1]，会把脚注定义当成链接 URL 输出
marked.use(markedFootnote());

// KaTeX: $...$ inline, $$...$$ block
marked.use({
  gfm: true,
  breaks: false,
  async: false,
});

function renderMath(text) {
  text = text.replace(/\$\$([^$]+?)\$\$/g, function(_, tex) {
    try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
    catch(e) { return "<code>" + tex + "</code>"; }
  });
  text = text.replace(/(?<!\$)(?<!\\)\$([^$\n]+?)\$(?!\$)/g, function(_, tex) {
    try { return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }); }
    catch(e) { return "<code>" + tex + "</code>"; }
  });
  return text;
}

function renderMarkdown(content, baseDir) {
  try {
    const withMath = renderMath(content);
    const rawHtml = marked.parse(withMath);
    const sanitized = DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
    });
    return resolveImages(sanitized, baseDir);
  } catch (err) {
    console.error("marked parse error:", err);
    return `<p>无法渲染此文件：${escapeHtml(String(err))}</p>`;
  }
}

// 把相对图片 src 改成 Tauri asset URL（按 .md 所在目录拼接），否则 WebView 会
// 按应用源解析相对路径而 404。图片目录已由 Rust 端 allow_dir 放行进 asset 协议 scope。
function resolveImages(html, baseDir) {
  if (!baseDir) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src || /^(https?:|data:|file:|asset:|blob:|#)/i.test(src)) return;
    const rel = src.replace(/^\.\//, "");
    img.setAttribute("src", convertFileSrc(baseDir + "/" + rel));
  });
  return container.innerHTML;
}

function renderPlainText(content) {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br>");
      return `<p>${lines}</p>`;
    })
    .join("\n");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// State
// ============================================================

let tabs = [];
let activeTabId = null;
let currentSearch = { term: "", matches: [], index: -1 };

// ============================================================
// Tabs
// ============================================================

function createTab(filePath, content) {
  const existing = tabs.find((t) => t.filePath === filePath);
  if (existing) {
    setActiveTabWithReload(existing.id);
    return;
  }

  const normalized = filePath.split("\\").join("/");
  const fileName = normalized.split("/").pop() || filePath;
  const isPlain = /\.txt$/i.test(fileName);
  const cleanPath = filePath.replace(/^file:\/\//, "");

  const id = crypto.randomUUID();
  const baseDir = cleanPath.replace(/[\\/][^\\/]*$/, "");
  const tab = { id, filePath: cleanPath, fileName, content, isPlain, scrollTop: 0, baseDir };
  tabs.push(tab);
  renderTabBar();
  setActiveTab(id);
}

function renderTabBar() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";

  tabs.forEach((tab) => {
    const tabEl = document.createElement("div");
    tabEl.className = "tab" + (tab.id === activeTabId ? " active" : "");
    tabEl.dataset.id = tab.id;
    tabEl.setAttribute("role", "tab");

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = tab.fileName;

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "×";
    closeBtn.title = "关闭 (Ctrl+W)";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    tabEl.appendChild(label);
    tabEl.appendChild(closeBtn);
    tabEl.addEventListener("click", () => setActiveTabWithReload(tab.id));
    // 中键点击关闭标签（浏览器/编辑器通用交互）
    tabEl.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });
    tabsEl.appendChild(tabEl);
  });

  // Scroll active tab into view
  const activeTab = tabsEl.querySelector(".tab.active");
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
}

// Tab scroll with mouse wheel — 惯性平滑
// wheel 事件只更新目标位置，rAF 逐帧追赶，不会因连续输入而卡顿
function setupTabScroll() {
  const tabsEl = document.getElementById("tabs");
  let target = tabsEl.scrollLeft;
  let animating = false;

  function animate() {
    const diff = target - tabsEl.scrollLeft;
    if (Math.abs(diff) < 0.5) {
      tabsEl.scrollLeft = target;
      animating = false;
      return;
    }
    // 每帧追赶 30%，越近越慢，手感类似惯性
    tabsEl.scrollLeft += diff * 0.3;
    requestAnimationFrame(animate);
  }

  tabsEl.addEventListener("wheel", (e) => {
    if (tabs.length <= 1) return;
    e.preventDefault();
    target += e.deltaY;
    // 防止越界
    const maxScroll = tabsEl.scrollWidth - tabsEl.clientWidth;
    target = Math.max(0, Math.min(target, maxScroll));
    if (!animating) {
      animating = true;
      requestAnimationFrame(animate);
    }
  }, { passive: false });
}

function setActiveTab(id) {
  const prev = tabs.find((t) => t.id === activeTabId);
  if (prev) {
    prev.scrollTop = document.getElementById("content-area").scrollTop;
  }

  activeTabId = id;
  const tab = tabs.find((t) => t.id === id);
  stopFileWatcher();
  renderTabBar();

  const welcome = document.getElementById("welcome");
  const docView = document.getElementById("document-view");
  const tocSection = document.getElementById("toc-section");
  if (!tab) {
    welcome.classList.remove("hidden");
    docView.classList.add("hidden");
    docView.innerHTML = "";
    tocSection.classList.add("hidden");
    renderToc([]);
    clearSearch();
    return;
  }

  welcome.classList.add("hidden");
  docView.classList.remove("hidden");
  tocSection.classList.remove("hidden");

  const contentArea = document.getElementById("content-area");
  contentArea.style.scrollBehavior = "auto";
  contentArea.scrollTop = 0;

  if (tab.isPlain) {
    docView.innerHTML = renderPlainText(tab.content);
  } else {
    docView.innerHTML = renderMarkdown(tab.content, tab.baseDir);
  }

  docView.scrollTop = 0;
  contentArea.scrollTop = tab.scrollTop;
  contentArea.style.scrollBehavior = "";
  renderTocFromDocument();
  startFileWatcher();
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  stopFileWatcher();
  tabs.splice(idx, 1);

  if (activeTabId === id) {
    activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null;
  }

  if (tabs.length === 0) {
    activeTabId = null;
    document.getElementById("document-view").innerHTML = "";
    document.getElementById("document-view").classList.add("hidden");
    document.getElementById("welcome").classList.remove("hidden");
    document.getElementById("toc-section").classList.add("hidden");
    renderTabBar();
    renderToc([]);
    clearSearch();
  } else if (activeTabId) {
    setActiveTab(activeTabId);
  } else {
    renderTabBar();
  }
}

// ============================================================
// Open files
// ============================================================

function isTauri() {
  // Tauri 2 不注入 window.__TAURI__（那是 v1 行为，v2 需开 withGlobalTauri）。
  // v2 始终注入 __TAURI_INTERNALS__，用它判断才准确。
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__ !== "undefined";
}

async function openFile() {
  if (!isTauri()) {
    await browserOpenFile();
    return;
  }
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Markdown & Text", extensions: ["md", "markdown", "txt"] }],
    });
    if (!selected) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    await openPath(path);
  } catch (err) {
    console.error("openFile error:", err);
  }
}

function browserOpenFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt";
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (file) {
        try {
          const content = await file.text();
          createTab("browser://" + file.name, content);
        } catch (err) {
          console.error("browser read error:", err);
        }
      }
      input.remove();
      resolve();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Tauri 的 readTextFile 强制按 UTF-8 解码，中文 Windows 上的 .txt/.md
 *  常是 GBK/GB18030，会整篇变成 U+FFFD。这里读二进制后自行判编码。 */
function decodeBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // 1) BOM 优先
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(b.subarray(3));
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(b.subarray(2));
  }
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(b.subarray(2));
  }
  // 2) 严格模式试 UTF-8：非法字节序列会抛错，不会静默出 U+FFFD
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    // 3) 落到中文 Windows 的常见编码（GB18030 是 GBK 的超集）
    try {
      return new TextDecoder("gb18030").decode(b);
    } catch {
      // 4) 兜底：容错的 UTF-8，至少不抛异常
      return new TextDecoder("utf-8").decode(b);
    }
  }
}

async function readTextSmart(path) {
  if (!isTauri()) return readTextFile(path);
  const bytes = await readFile(path);
  return decodeBytes(bytes);
}

async function openPath(path) {
  try {
    let content;
    try {
      content = await readTextSmart(path);
    } catch (err) {
      await invoke("allow_file", { path });
      content = await readTextSmart(path);
    }
    const baseDir = path.replace(/[\\/][^\\/]*$/, "");
    await invoke("allow_dir", { path: baseDir }).catch(() => {});
    createTab(path, content);
  } catch (err) {
    console.error("openPath error:", err, "| path:", path);
  }
}

window.__openPath = openPath;

// ============================================================
// Drag & drop
// ============================================================

async function setupDragDrop() {
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    const webview = getCurrentWebview();
    webview.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        for (const filePath of event.payload.paths) {
          if (/\.(md|markdown|txt)$/i.test(filePath)) {
            openPath(filePath);
          }
        }
      }
    });
  } catch (err) {
    console.error("dragdrop setup error:", err);
  }
}

// ============================================================
// Table of contents
// ============================================================

function renderTocFromDocument() {
  const docView = document.getElementById("document-view");
  const headings = docView.querySelectorAll("h1, h2, h3");
  const items = [];

  headings.forEach((heading, idx) => {
    if (!heading.id) heading.id = "kinglet-h-" + idx;
    items.push({
      id: heading.id,
      text: heading.textContent.trim(),
      level: parseInt(heading.tagName[1], 10),
    });
  });

  renderToc(items);
}

function renderToc(items) {
  const list = document.getElementById("toc-list");
  list.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "toc-empty";
    empty.textContent = "无标题";
    empty.style.cssText = "color: var(--fg-faint); font-size: 12px;";
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lvl-" + item.level;
    const a = document.createElement("a");
    a.href = "#" + item.id;
    a.textContent = item.text;
    a.dataset.target = item.id;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById(item.id);
      if (target) scrollTargetIntoView(target);
    });
    li.appendChild(a);
    list.appendChild(li);
  });
}

function setupTocScrollSpy() {
  const docView = document.getElementById("content-area");
  docView.addEventListener(
    "scroll",
    () => {
      const links = document.querySelectorAll("#toc-list a[data-target]");
      if (links.length === 0) return;
      // 动态测量 toolbar 高度，不用硬编码
      const toolbar = document.getElementById("toolbar");
      const offset = toolbar ? toolbar.offsetHeight + 16 : 80;
      let current = null;
      // 容差：允许 toolbar 下方一小段范围内的标题也被选中
      // 不能太大，否则标题还在视口中间就被选中，scrollIntoView 不会触发滚动
      var tolerance = 60;
      links.forEach((link) => {
        const target = document.getElementById(link.dataset.target);
        if (!target) return;
        var rect = target.getBoundingClientRect();
        if (rect.top <= offset + tolerance) {
          current = link;
        }
      });
      // 如果没有匹配（页面在最顶部），选中第一个
      if (!current && links.length > 0) {
        current = links[0];
      }
      links.forEach((link) => link.classList.toggle("active", link === current));
      if (current) {
        current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    },
    { passive: true }
  );
}

// ============================================================
// Search in page
// ============================================================

function clearSearch() {
  currentSearch = { term: "", matches: [], index: -1 };
  const docView = document.getElementById("document-view");
  docView.querySelectorAll("mark").forEach((m) => {
    const text = m.textContent;
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(text), m);
    parent.normalize();
  });
  document.getElementById("search-input").value = "";
  document.getElementById("search-count").textContent = "";
  document.getElementById("search-nav").classList.add("hidden");
}

function doSearch(term) {
  const docView = document.getElementById("document-view");
  docView.querySelectorAll("mark").forEach((m) => {
    const text = m.textContent;
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(text), m);
    parent.normalize();
  });

  currentSearch = { term, matches: [], index: -1 };
  const countEl = document.getElementById("search-count");

  if (!term) {
    countEl.textContent = "";
    document.getElementById("search-nav").classList.add("hidden");
    return;
  }

  if (docView.querySelectorAll("h1, p, li, td, th, blockquote, pre, code").length === 0) {
    countEl.textContent = "0";
    document.getElementById("search-nav").classList.add("hidden");
    return;
  }

  const walker = document.createTreeWalker(docView, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement.tagName === "SCRIPT") return NodeFilter.FILTER_REJECT;
      if (node.parentElement.tagName === "STYLE") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const lower = node.textContent.toLowerCase();
    let idx = lower.indexOf(term.toLowerCase());
    if (idx === -1) return;
    const span = document.createElement("mark");
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + term.length);
    range.surroundContents(span);
  });

  currentSearch.matches = Array.from(docView.querySelectorAll("mark"));
  countEl.textContent = currentSearch.matches.length ? `1/${currentSearch.matches.length}` : "0";
  document.getElementById("search-nav").classList.remove("hidden");
  if (currentSearch.matches.length) jumpToMatch(0);
}

function jumpToMatch(index) {
  if (!currentSearch.matches.length) return;
  currentSearch.index = (index + currentSearch.matches.length) % currentSearch.matches.length;
  const match = currentSearch.matches[currentSearch.index];
  match.scrollIntoView({ behavior: "smooth", block: "center" });
  currentSearch.matches.forEach((m, i) => m.classList.toggle("current", i === currentSearch.index));
  document.getElementById("search-count").textContent =
    `${currentSearch.index + 1}/${currentSearch.matches.length}`;
}

// ============================================================
// Theme
// ============================================================

const THEME_KEY = "kinglet-theme";

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function applyTheme(theme) {
  settings.theme = theme;
  applySettings();
}

function toggleTheme() {
  // Ctrl+Shift+L 只在亮/暗之间快切；细选走设置面板
  const darkish = new Set(["dark", "black"]);
  applyTheme(darkish.has(getStoredTheme()) ? "light" : "dark");
}

// ============================================================
// Settings (纯 localStorage，不依赖任何 Tauri 插件)
// ============================================================

const SETTINGS_KEY = "kinglet-settings";
const FS_MIN = 14;
const FS_MAX = 22;
const DEFAULT_SETTINGS = {
  theme: "light",
  font: "sans",
  fontSize: 15,
  lineHeight: 1.8,
  customFontPath: "",
  textAlign: "default",
};

// 版式：文本对齐。default = 跟随文档（不强制）；其余 5 种强制全局对齐（覆盖文档自带的对齐）
const ALIGN = {
  default:         { a: "start",   last: "auto" },
  left:            { a: "left",    last: "auto" },
  right:           { a: "right",   last: "auto" },
  center:          { a: "center",  last: "auto" },
  justify:         { a: "justify", last: "left" },
  "justify-right": { a: "justify", last: "right" },
};

const PRESETS = {
  day: { theme: "white", font: "serif", fontSize: 16, lineHeight: 1.8 },
  eyecare: { theme: "sepia", font: "serif", fontSize: 17, lineHeight: 2.1 },
  night: { theme: "dark", font: "sans", fontSize: 16, lineHeight: 1.8 },
  compact: { theme: "light", font: "sans", fontSize: 14, lineHeight: 1.6 },
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (raw && typeof raw === "object") settings = { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  // 兼容只存过 kinglet-theme 的老版本
  const legacy = localStorage.getItem(THEME_KEY);
  if (legacy && !settings.theme) settings.theme = legacy;
  settings.fontSize = Math.min(FS_MAX, Math.max(FS_MIN, Number(settings.fontSize) || 15));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const CUSTOM_FONT_FAMILY = "KingletCustom";
const CUSTOM_FONT_STYLE_ID = "kinglet-custom-font";

function setCustomFontFace(src) {
  let el = document.getElementById(CUSTOM_FONT_STYLE_ID);
  if (!src) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = CUSTOM_FONT_STYLE_ID;
    document.head.appendChild(el);
  }
  // font-display: swap 免得字体大时白屏等待
  el.textContent =
    '@font-face { font-family: "' + CUSTOM_FONT_FAMILY + '"; src: url("' + src + '"); font-display: swap; }';
}

/** 把 settings.customFontPath 变成能用的 @font-face。Tauri 下走 asset protocol
 *  （零拷贝，不像 base64 那样每次启动读盘+编码 10-20MB）。 */
async function loadCustomFont() {
  const path = settings.customFontPath;
  if (!path) {
    setCustomFontFace("");
    updateFontFileUI();
    return;
  }
  if (path.startsWith("blob:") || path.startsWith("data:")) {
    setCustomFontFace(path);
    updateFontFileUI();
    return;
  }
  if (!isTauri()) {
    setCustomFontFace("");
    updateFontFileUI();
    return;
  }
  try {
    await invoke("allow_font_file", { path });
    setCustomFontFace(convertFileSrc(path));
  } catch (err) {
    console.error("load custom font failed:", err, path);
    setCustomFontFace("");
    setFontFileError("字体文件加载失败（可能已被移动或删除）");
  }
  updateFontFileUI();
}

function baseName(p) {
  if (!p) return "";
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function setFontFileError(msg) {
  const el = document.getElementById("font-file-name");
  if (el) {
    el.textContent = msg;
    el.style.color = "#b4423a";
  }
}

function updateFontFileUI() {
  const row = document.getElementById("custom-font-row");
  if (row) row.classList.toggle("hidden", settings.font !== "custom");
  const el = document.getElementById("font-file-name");
  if (el) {
    el.style.color = "";
    el.textContent = settings.customFontPath ? baseName(settings.customFontPath) : "点击选择字体文件…";
  }
  // 已经选好字体就不用再摆使用说明，省出面板高度
  const hint = document.getElementById("font-hint");
  if (hint) hint.classList.toggle("hidden", !!settings.customFontPath);
}

async function pickCustomFont() {
  try {
    if (isTauri()) {
      const picked = await open({
        multiple: false,
        filters: [{ name: "字体", extensions: ["ttf", "otf", "woff2", "woff", "ttc"] }],
      });
      if (!picked) return;
      settings.customFontPath = typeof picked === "string" ? picked : picked.path;
      settings.font = "custom";
      applySettings();
      await loadCustomFont();
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".ttf,.otf,.woff2,.woff,.ttc";
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        if (f) {
          settings.customFontPath = URL.createObjectURL(f);
          settings.font = "custom";
          applySettings();
          loadCustomFont();
        }
        input.remove();
      });
      input.click();
    }
  } catch (err) {
    console.error("pick font failed:", err);
    setFontFileError("选择字体失败：" + String(err));
  }
}

function clearCustomFont() {
  settings.customFontPath = "";
  if (settings.font === "custom") settings.font = "default";
  setCustomFontFace("");
  applySettings();
}

function applySettings() {
  const root = document.documentElement;
  document.body.setAttribute("data-theme", settings.theme);
  document.body.setAttribute("data-font", settings.font);
  root.style.setProperty("--doc-font-size", settings.fontSize + "px");
  root.style.setProperty("--doc-line-height", String(settings.lineHeight));
  const al = ALIGN[settings.textAlign] || ALIGN.default;
  root.style.setProperty("--doc-align", al.a);
  root.style.setProperty("--doc-align-last", al.last);
  document.body.setAttribute("data-force-align", settings.textAlign === "default" ? "0" : "1");
  localStorage.setItem(THEME_KEY, settings.theme);
  saveSettings();
  syncSettingsUI();
  updateFontFileUI();
}

function syncSettingsUI() {
  document.querySelectorAll("#theme-swatches .swatch").forEach((b) => {
    b.classList.toggle("active", b.dataset.themeVal === settings.theme);
  });
  document.querySelectorAll("#font-choices .seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.fontVal === settings.font);
  });
  document.querySelectorAll("#lh-choices .seg-btn").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.lhVal) === Number(settings.lineHeight));
  });
  document.querySelectorAll("#align-choices .align-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.alignVal === settings.textAlign);
  });
  const fsv = document.getElementById("fs-value");
  if (fsv) fsv.textContent = settings.fontSize + "px";
  const minus = document.getElementById("fs-minus");
  const plus = document.getElementById("fs-plus");
  if (minus) minus.disabled = settings.fontSize <= FS_MIN;
  if (plus) plus.disabled = settings.fontSize >= FS_MAX;
}

function showSettingsTab(name) {
  document.querySelectorAll("#settings-tabs .set-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll("#settings-body .tab-pane").forEach((p) => {
    p.classList.toggle("hidden", p.dataset.pane !== name);
  });
  // 「恢复默认」只针对界面设置，备份页签下藏起来，
  // 免得和「清空全部数据」混淆
  document.getElementById("settings-foot").classList.toggle("hidden", name !== "ui");
  if (name !== "backup") setBackupStatus("");
}

function openSettings(tab = "ui") {
  document.getElementById("settings-panel").classList.remove("hidden");
  document.getElementById("settings-overlay").classList.remove("hidden");
  showSettingsTab(tab);
  syncSettingsUI();
}

function setBackupStatus(msg) {
  const el = document.getElementById("backup-status");
  if (el) el.textContent = msg || "";
}

// ---------- 备份 / 恢复（配置 + 最近打开）----------

function buildBackup() {
  return JSON.stringify(
    {
      app: "Kinglet",
      kind: "kinglet-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
    },
    null,
    2
  );
}

async function exportBackup() {
  const json = buildBackup();
  const name = "kinglet-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  try {
    if (isTauri()) {
      const path = await save({
        defaultPath: name,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("allow_save_file", { path });
      await writeTextFile(path, json);
      setBackupStatus("已导出到 " + path);
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setBackupStatus("已下载 " + name);
    }
  } catch (err) {
    console.error("export backup failed:", err);
    setBackupStatus("导出失败：" + String(err));
  }
}

function applyBackup(data) {
  if (!data || data.kind !== "kinglet-backup") {
    setBackupStatus("这不像 Kinglet 的备份文件");
    return false;
  }
  if (data.settings && typeof data.settings === "object") {
    settings = { ...DEFAULT_SETTINGS, ...data.settings };
    settings.fontSize = Math.min(FS_MAX, Math.max(FS_MIN, Number(settings.fontSize) || 15));
    applySettings();
    loadCustomFont();
  }
  setBackupStatus("已恢复（导出于 " + (data.exportedAt || "未知时间").slice(0, 19).replace("T", " ") + "）");
  return true;
}

async function importBackup() {
  try {
    if (isTauri()) {
      const picked = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!picked) return;
      const path = typeof picked === "string" ? picked : picked.path;
      try {
        await invoke("allow_file", { path });
      } catch {}
      applyBackup(JSON.parse(await readTextFile(path)));
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.addEventListener("change", async () => {
        const f = input.files && input.files[0];
        if (f) {
          try {
            applyBackup(JSON.parse(await f.text()));
          } catch (err) {
            setBackupStatus("解析失败：" + String(err));
          }
        }
        input.remove();
      });
      input.click();
    }
  } catch (err) {
    console.error("import backup failed:", err);
    setBackupStatus("导入失败：" + String(err));
  }
}

function resetAllData() {
  if (!confirm(STRINGS.backup_reset_confirm)) return;
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(THEME_KEY);
  settings = { ...DEFAULT_SETTINGS };
  applySettings();
  setBackupStatus("已清空，回到初装状态");
}

// ============================================================
// Auto-update
// ============================================================

async function checkForUpdates(silent) {
  if (!isTauri()) {
    if (!silent) alert(STRINGS.update_browser_mode);
    return;
  }
  try {
    const update = await checkUpdate();
    if (update && update.available) {
      const msg = "发现新版本 v" + update.version + "！\n\n" +
        (update.body ? update.body + "\n\n" : "") +
        "是否现在下载并安装？";
      if (confirm(msg)) {
        await update.downloadAndInstall();
        await invoke("plugin:updater|restart");
      }
    } else if (!silent) {
      alert(STRINGS.update_no_update);
    }
  } catch (err) {
    if (!silent) alert(STRINGS.update_fail + String(err));
    console.warn("update check failed:", err);
  }
}

function closeSettings() {
  document.getElementById("settings-panel").classList.add("hidden");
  document.getElementById("settings-overlay").classList.add("hidden");
}

function settingsOpen() {
  return !document.getElementById("settings-panel").classList.contains("hidden");
}

function openAbout() {
  document.getElementById("about-panel").classList.remove("hidden");
  document.getElementById("about-overlay").classList.remove("hidden");
  document.getElementById("about-version").textContent = APP_VERSION;
}
function closeAbout() {
  document.getElementById("about-panel").classList.add("hidden");
  document.getElementById("about-overlay").classList.add("hidden");
}
function aboutOpen() {
  return !document.getElementById("about-panel").classList.contains("hidden");
}

// ============================================================
// i18n: 从 STRINGS 填充所有 data-i18n 标记的 HTML 元素
// ============================================================

function setUIStrings() {
  // data-i18n -> textContent
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (STRINGS[key] !== undefined) el.textContent = STRINGS[key];
  });
  // data-i18n-placeholder -> placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (STRINGS[key] !== undefined) el.placeholder = STRINGS[key];
  });
  // data-i18n-title -> title
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (STRINGS[key] !== undefined) el.title = STRINGS[key];
  });
  // 脚注标签（CSS content 属性，通过 CSS 变量控制）
  document.documentElement.style.setProperty("--str-footnotes-label", '"' + STRINGS.footnotes_label + '"');
}

function setupSettings() {
  loadSettings();
  applySettings();
  loadCustomFont();

  document.getElementById("settings-close").addEventListener("click", closeSettings);
  document.getElementById("settings-overlay").addEventListener("click", closeSettings);
  document.getElementById("about-close").addEventListener("click", closeAbout);
  document.getElementById("about-overlay").addEventListener("click", closeAbout);
  document.getElementById("about-github").addEventListener("click", (e) => {
    e.preventDefault();
    openUrl("https://github.com/BExhei/Kinglet");
  });

  document.querySelectorAll("#settings-tabs .set-tab").forEach((t) => {
    t.addEventListener("click", () => showSettingsTab(t.dataset.tab));
  });

  document.getElementById("font-pick").addEventListener("click", pickCustomFont);
  document.getElementById("font-clear").addEventListener("click", clearCustomFont);

  document.getElementById("backup-export").addEventListener("click", exportBackup);
  document.getElementById("backup-import").addEventListener("click", importBackup);
  document.getElementById("backup-reset").addEventListener("click", resetAllData);

  document.querySelectorAll("#preset-cards .preset-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.preset];
      if (p) {
        settings = { ...settings, ...p };
        applySettings();
      }
    });
  });

  document.querySelectorAll("#theme-swatches .swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.theme = btn.dataset.themeVal;
      applySettings();
    });
  });

  document.querySelectorAll("#font-choices .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.font = btn.dataset.fontVal;
      applySettings();
    });
  });

  document.querySelectorAll("#lh-choices .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.lineHeight = Number(btn.dataset.lhVal);
      applySettings();
    });
  });

  document.querySelectorAll("#align-choices .align-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.textAlign = btn.dataset.alignVal;
      applySettings();
    });
  });

  document.getElementById("fs-minus").addEventListener("click", () => {
    settings.fontSize = Math.max(FS_MIN, settings.fontSize - 1);
    applySettings();
  });
  document.getElementById("fs-plus").addEventListener("click", () => {
    settings.fontSize = Math.min(FS_MAX, settings.fontSize + 1);
    applySettings();
  });

  document.getElementById("settings-reset").addEventListener("click", () => {
    settings = { ...DEFAULT_SETTINGS };
    applySettings();
  });
}

// ============================================================
// Click handling on rendered document
// ============================================================

async function handleDocumentClick(e) {
  const anchor = e.target.closest("a[href]");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href) return;

  if (href.startsWith("#")) {
    const target = document.getElementById(href.slice(1));
    if (target) {
      e.preventDefault();
      scrollTargetIntoView(target);
    }
    return;
  }

  if (/^https?:\/\//i.test(href)) {
    e.preventDefault();
    try {
      await openUrl(href);
    } catch (err) {
      console.error("openUrl error:", err);
    }
    return;
  }

  const active = tabs.find((t) => t.id === activeTabId);
  if (!active || !active.filePath) return;
  const base = active.filePath.replace(/\/?[^/]*$/, "");
  const joined = href.startsWith("/") ? href : `${base}/${href}`;
  if (/\.(md|markdown)$/i.test(joined)) {
    e.preventDefault();
    openPath(joined);
  }
}

// ============================================================
// File change detection
// ============================================================

async function checkFileChanged(filePath, oldContent) {
  try {
    const current = await readTextSmart(filePath);
    if (current !== oldContent) return current;
  } catch {}
  return null;
}

// 实时文件监控：用操作系统原生文件变更通知（Windows: ReadDirectoryChangesW）
// 不轮询，不占 CPU，文件被外部修改时即时响应（同 Notepad4/Notepad++ 原理）
let fileWatcherUnwatch = null;
let filePollTimer = null;

async function applyFileRefresh(tab) {
  try {
    const fresh = await readTextSmart(tab.filePath);
    if (fresh === null || fresh === tab.content) return;
    const area = document.getElementById("content-area");
    const scrollRatio = area.scrollHeight > 0
      ? area.scrollTop / (area.scrollHeight - area.clientHeight)
      : 0;
    tab.content = fresh;
    const docView = document.getElementById("document-view");
    docView.innerHTML = tab.isPlain
      ? renderPlainText(fresh)
      : renderMarkdown(fresh, tab.baseDir);
    const newMax = area.scrollHeight - area.clientHeight;
    if (newMax > 0) area.scrollTop = Math.round(scrollRatio * newMax);
    renderTocFromDocument();
  } catch {}
}

// 兜底：始终给"当前活动文件"一个轻量轮询，保证实时监控必定生效。
// fs.watch 正常时它能即时响应；fs.watch 不可用/不触发时，轮询 2s 内照样刷到。
// 只读活动 tab 的单文件，代价可控。
function startFilePoll(tab) {
  stopFilePoll();
  filePollTimer = setInterval(async () => {
    const currentTab = tabs.find((t) => t.id === activeTabId);
    if (!currentTab || currentTab.filePath !== tab.filePath) return;
    await applyFileRefresh(currentTab);
  }, 2000);
}
function stopFilePoll() {
  if (filePollTimer) { clearInterval(filePollTimer); filePollTimer = null; }
}

async function startFileWatcher() {
  stopFileWatcher();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab || tab.isPlain || !tab.filePath) return;
  // 轮询兜底（一定生效）
  startFilePoll(tab);
  // 主路径：OS 原生文件变更通知。监听父目录更可靠（Windows 上 notify 对"文件路径"不稳），
  // 再用文件名过滤，只响应目标文件。
  const dir = tab.filePath.replace(/[\\/][^\\/]*$/, "");
  const target = tab.filePath.replace(/\\/g, "/");
  try {
    fileWatcherUnwatch = await watch(dir, async (event) => {
      const ev = event.type;
      const isModify = ev === "any" || (ev && typeof ev === "object" && "modify" in ev);
      if (!isModify) return;
      const changed = event.paths.some((p) => {
        const norm = p.replace(/\\/g, "/");
        return norm === target || norm.split("/").pop() === tab.fileName;
      });
      if (!changed) return;
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab || currentTab.filePath !== tab.filePath) return;
      await applyFileRefresh(currentTab);
    }, { delayMs: 500 });
  } catch (err) {
    console.warn("fs.watch unavailable, polling fallback active:", err);
  }
}

function stopFileWatcher() {
  stopFilePoll();
  if (fileWatcherUnwatch) {
    try { fileWatcherUnwatch(); } catch {}
    fileWatcherUnwatch = null;
  }
}

async function setActiveTabWithReload(id) {
  const tab = tabs.find((t) => t.id === id);
  if (tab && !tab.isPlain) {
    const fresh = await checkFileChanged(tab.filePath, tab.content);
    if (fresh !== null) {
      const scrollRatio =
        document.getElementById("content-area").scrollHeight > 0
          ? document.getElementById("content-area").scrollTop /
            (document.getElementById("content-area").scrollHeight - window.innerHeight)
          : 0;
      tab.content = fresh;
      tab.scrollTop = 0;
      setActiveTab(id);
      const area = document.getElementById("content-area");
      if (scrollRatio > 0) {
        area.scrollTop = scrollRatio * (area.scrollHeight - window.innerHeight);
      }
      return;
    }
  }
  setActiveTab(id);
}

// ============================================================
// Keyboard shortcuts
// ============================================================

function setupShortcuts() {
  window.addEventListener("keydown", async (e) => {
    const inSearch = document.activeElement === document.getElementById("search-input");

    // 刷新键（F5 / Ctrl+R / Ctrl+Shift+R）会重载页面清空所有打开的标签 —— 桌面应用不该刷新，拦截掉
    if (e.key === "F5" || (e.ctrlKey && (e.key === "r" || e.key === "R"))) {
      e.preventDefault();
      return;
    }

    // Ctrl+, 打开设置
    if (e.ctrlKey && e.key === ",") {
      e.preventDefault();
      if (settingsOpen()) closeSettings();
      else openSettings("ui");
      return;
    }

    // Esc 关设置面板（优先于搜索框的 Esc）
    if (e.key === "Escape") {
      var fs = document.getElementById("floating-search");
      if (!fs.classList.contains("hidden")) {
        e.preventDefault();
        fs.classList.add("hidden");
        clearSearch();
        return;
      }
      if (settingsOpen()) {
        e.preventDefault();
        closeSettings();
        return;
      }
      if (aboutOpen()) {
        e.preventDefault();
        closeAbout();
        return;
      }
    }

    if (e.ctrlKey && !e.shiftKey && (e.key === "w" || e.key === "W")) {
      e.preventDefault();
      if (activeTabId) closeTab(activeTabId);
      return;
    }

    if (e.ctrlKey && e.key === "Tab") {
      e.preventDefault();
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      const next = tabs[(idx + 1) % tabs.length];
      setActiveTabWithReload(next.id);
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
      e.preventDefault();
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      const next = tabs[(idx - 1 + tabs.length) % tabs.length];
      setActiveTabWithReload(next.id);
      return;
    }

    if (e.ctrlKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      openFile();
      return;
    }

    if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      window.print();
      return;
    }

    if (e.ctrlKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      if (document.body.classList.contains("sidebar-collapsed")) {
        var fs = document.getElementById("floating-search");
        fs.classList.remove("hidden");
        document.getElementById("floating-search-input").focus();
      } else {
        const input = document.getElementById("search-input");
        input.focus();
        input.select();
      }
      return;
    }

    if (e.ctrlKey && (e.key === "a" || e.key === "A")) {
      // Ctrl+A：只选中正文区域，不选侧栏和菜单
      const docView = document.getElementById("document-view");
      if (docView && !docView.classList.contains("hidden")) {
        e.preventDefault();
        const range = document.createRange();
        range.selectNodeContents(docView);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return;
    }

    if (e.ctrlKey && e.key === "\\") {
      e.preventDefault();
      document.body.classList.toggle("sidebar-collapsed");
      return;
    }

    if (e.ctrlKey && e.shiftKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      toggleTheme();
      return;
    }

    if (inSearch) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (currentSearch.matches.length) {
          jumpToMatch(e.shiftKey ? currentSearch.index - 1 : currentSearch.index + 1);
        } else {
          doSearch(document.getElementById("search-input").value);
        }
      } else if (e.key === "Escape") {
        clearSearch();
        document.getElementById("document-view").focus();
      }
    }
  });
}

// ============================================================
// Context menu
// ============================================================

/**
 * 精确滚动：只动 #content-area，不触碰 viewport。
 * scrollIntoView 会滚动所有可滚动祖先（包括浏览器 viewport），
 * 导致 #toolbar 和标签栏被一起推到屏幕外。
 */
function scrollTargetIntoView(el) {
  var container = document.getElementById("content-area");
  if (!container) return;
  var toolbar = document.getElementById("toolbar");
  var headerH = toolbar ? toolbar.offsetHeight : 52;
  // 计算元素相对 container 的位置
  var elTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  var targetY = Math.max(0, elTop - headerH - 8);
  container.scrollTo({ top: targetY, behavior: "smooth" });
}

function setupContextMenu() {
  var menu = document.createElement("div");
  menu.id = "context-menu";
  menu.className = "hidden";
  document.body.appendChild(menu);

  var items = [
    { label: STRINGS.ctx_open, shortcut: "Ctrl+O", action: openFile },
    { label: STRINGS.ctx_print, shortcut: "Ctrl+P", action: function() { window.print(); } },
    null,
    { label: STRINGS.ctx_find, shortcut: "Ctrl+F", action: function() {
      if (document.body.classList.contains("sidebar-collapsed")) {
        var fs = document.getElementById("floating-search");
        fs.classList.remove("hidden");
        document.getElementById("floating-search-input").focus();
      } else {
        var si = document.getElementById("search-input");
        if (si) si.focus();
      }
    }},
    { label: STRINGS.ctx_toggle_sidebar, shortcut: "Ctrl+\\", action: function() {
      document.body.classList.toggle("sidebar-collapsed");
    }},
    { label: STRINGS.ctx_toggle_theme, shortcut: "", action: toggleTheme },
    null,
    { label: STRINGS.ctx_copy, shortcut: "Ctrl+C", action: function() { document.execCommand("copy"); } },
    { label: STRINGS.ctx_select_all, shortcut: "Ctrl+A", action: function() {
      const docView = document.getElementById("document-view");
      if (docView && !docView.classList.contains("hidden")) {
        const range = document.createRange();
        range.selectNodeContents(docView);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }},
    null,
    { label: STRINGS.ctx_settings, shortcut: "Ctrl+,", action: function() { openSettings("ui"); } },
  ];

  items.forEach(function(item) {
    if (!item) {
      var sep = document.createElement("div");
      sep.className = "ctx-sep";
      menu.appendChild(sep);
      return;
    }
    var btn = document.createElement("button");
    btn.className = "ctx-item";
    var lbl = document.createElement("span");
    lbl.textContent = item.label;
    var sc = document.createElement("span");
    sc.className = "ctx-sc";
    sc.textContent = item.shortcut;
    btn.appendChild(lbl);
    btn.appendChild(sc);
    btn.addEventListener("click", function() {
      menu.classList.add("hidden");
      item.action();
    });
    menu.appendChild(btn);
  });

  window.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    menu.classList.remove("hidden");
    var mw = menu.offsetWidth || 200;
    var mh = menu.offsetHeight || 300;
    menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + "px";
    menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + "px";
  });

  window.addEventListener("click", function() {
    menu.classList.add("hidden");
  });
  window.addEventListener("keydown", function(e) {
    if (e.key === "Escape") menu.classList.add("hidden");
  });
}

// ============================================================
// Boot
// ============================================================

window.addEventListener("DOMContentLoaded", async () => {
  setUIStrings();
  setupSettings();
  document.getElementById("settings-panel").classList.add("hidden");
  document.getElementById("settings-overlay").classList.add("hidden");

  document.getElementById("open-file-btn").addEventListener("click", openFile);
  document.getElementById("new-tab-btn").addEventListener("click", openFile);
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);

  // Menubar — click to toggle dropdowns
  document.querySelectorAll(".menu-item").forEach((item) => {
    const label = item.querySelector(".menu-label");
    if (label) {
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = item.classList.contains("open");
        // Close all menus
        document.querySelectorAll(".menu-item.open").forEach((m) => m.classList.remove("open"));
        // Toggle current
        if (!isOpen) {
          item.classList.add("open");
        }
      });
    }
  });

  // Custom context menu: replaces browser default with app actions
  setupContextMenu();

  // Close menus on outside click
  document.addEventListener("click", () => {
    document.querySelectorAll(".menu-item.open").forEach((m) => m.classList.remove("open"));
  });

  // Menu item actions
  document.getElementById("menu-open").addEventListener("click", openFile);
  document.getElementById("menu-print").addEventListener("click", () => {
    // WebView2 的系统打印对话框会被 Tauri 窗口遮盖，先最小化再打印
    try { getCurrentWindow().minimize(); } catch {}
    setTimeout(() => window.print(), 200);
  });
  document.getElementById("menu-toggle-sidebar").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });
  document.getElementById("menu-toggle-theme").addEventListener("click", toggleTheme);
  document.getElementById("menu-ui-settings").addEventListener("click", () => openSettings("ui"));
  document.getElementById("menu-backup-settings").addEventListener("click", () => openSettings("backup"));
  document.getElementById("menu-about").addEventListener("click", () => {
    openAbout();
  });
  document.getElementById("menu-check-update").addEventListener("click", () => {
    checkForUpdates(false);
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    doSearch(e.target.value.trim());
  });
  document.getElementById("search-prev").addEventListener("click", () => {
    if (currentSearch.matches.length) jumpToMatch(currentSearch.index - 1);
  });
  document.getElementById("search-next").addEventListener("click", () => {
    if (currentSearch.matches.length) jumpToMatch(currentSearch.index + 1);
  });
  document.getElementById("search-clear").addEventListener("click", clearSearch);

  // 浮动搜索框（侧栏隐藏时使用）
  var fsInput = document.getElementById("floating-search-input");
  var fsCount = document.getElementById("floating-search-count");
  var fsPanel = document.getElementById("floating-search");

  function updateFloatingCount() {
    if (currentSearch.matches.length > 0) {
      fsCount.textContent = (currentSearch.index + 1) + "/" + currentSearch.matches.length;
    } else if (fsInput.value.trim()) {
      fsCount.textContent = "0";
    } else {
      fsCount.textContent = "";
    }
  }

  fsInput.addEventListener("input", function() {
    doSearch(fsInput.value.trim());
    updateFloatingCount();
  });

  fsInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (currentSearch.matches.length > 0) {
        jumpToMatch((currentSearch.index + 1) % currentSearch.matches.length);
        updateFloatingCount();
      }
    }
  });
  document.getElementById("floating-search-prev").addEventListener("click", function() {
    if (currentSearch.matches.length) jumpToMatch(currentSearch.index - 1);
  });
  document.getElementById("floating-search-next").addEventListener("click", function() {
    if (currentSearch.matches.length) jumpToMatch(currentSearch.index + 1);
  });
  document.getElementById("floating-search-clear").addEventListener("click", function() {
    fsPanel.classList.add("hidden");
    clearSearch();
  });

  document.getElementById("document-view").addEventListener("click", handleDocumentClick);
  document.getElementById("content-area").addEventListener("scroll", () => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (active) active.scrollTop = document.getElementById("content-area").scrollTop;
  }, { passive: true });

  setupTocScrollSpy();
  setupTabScroll();
  setupShortcuts();

  try {
    await listen("open-file", (event) => {
      openPath(event.payload);
    });
    await listen("menu-open", () => openFile());
    await listen("menu-print", () => window.print());
  } catch (err) {
    console.warn("Tauri events unavailable (browser mode):", err);
  }

  try {
    const pending = await invoke("get_pending_file");
    if (pending) await openPath(pending);
  } catch {}

  await setupDragDrop();

  // 启动时静默检查更新（不弹窗打扰，只在有更新时提示）
  setTimeout(() => checkForUpdates(true), 3000);
});
