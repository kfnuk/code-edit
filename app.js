// --- CodeMirror Imports ---
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, dropCursor, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { searchKeymap, highlightSelectionMatches, search, openSearchPanel } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap, codeFolding } from "@codemirror/language";
import { lintKeymap, lintGutter } from "@codemirror/lint";

// --- Helpers ---
function detectLang(filename = "") {
  if (/\.js$/i.test(filename)) return javascript();
  if (/\.html?$/i.test(filename)) return html({ matchClosingTags: true, autoCloseTags: true });
  if (/\.css$/i.test(filename)) return css();
  if (/\.json$/i.test(filename)) return json();
  if (/\.xml$/i.test(filename)) return xml();
  if (/\.md$/i.test(filename)) return markdown({ base: javascript, codeLanguages: languages });
  if (/\.py$/i.test(filename)) return python();
  return null;
}
function getDefaultUntitled(index = 1) {
  return { name: `untitled${index ? "-" + index : ""}.txt`, content: "", lang: javascript(), dirty: false };
}

// --- State ---
let openTabs = [];       // [{name, content, dirty, handle, fileHandle}]
let activeTab = null;    // filename
let editors = {};        // filename: EditorView
let currentEditorView = null;
let untitledCount = 1;   // For generating unique blank files
let folderHandles = null;

// --- DOM Elements ---
let fileListElement, tabsContainerElement, editorPaneElement;

// --- UI Rendering ---

function renderFileList() {
  fileListElement.innerHTML = "";
  if (folderHandles) {
    for (const file of folderHandles) {
      const div = document.createElement("div");
      div.className = "file" + (activeTab === file.name ? " active" : "");
      div.innerHTML = `<i class="mdi mdi-file"></i> ${file.name}`;
      div.onclick = () => openFileFromFolder(file.handle, file.name);
      fileListElement.appendChild(div);
    }
  }
}

function renderTabs() {
  tabsContainerElement.innerHTML = "";
  openTabs.forEach(tab => {
    const iconClass = getFileIcon(tab.name);
    const div = document.createElement("div");
    div.className = "tab" + (activeTab === tab.name ? " active" : "");
    div.innerHTML = `<i class="mdi ${iconClass}"></i> ${tab.name} <span class="close mdi mdi-close"></span>`;
    div.addEventListener("click", (event) => {
      if (event.target.classList.contains("close")) {
        closeTab(tab.name);
      } else {
        switchTab(tab.name);
      }
    });
    tabsContainerElement.appendChild(div);
  });
}


function renderEditor() {
  editorPaneElement.innerHTML = "";
  if (!activeTab) { currentEditorView = null; return; }
  const tab = openTabs.find(t => t.name === activeTab);
  if (!tab) { currentEditorView = null; return; }

  if (!editors[tab.name]) {
    const ext = detectLang(tab.name);
    const extensionArr = [
      oneDark,
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      dropCursor(),
      rectangularSelection(),
      defaultHighlightStyle.fallback,
      search({ top: true }),
      highlightSelectionMatches(),
      closeBrackets(),
      bracketMatching(),
      foldGutter({}),
      codeFolding(),
      lintGutter(),
      autocompletion(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...lintKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      ext,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          tab.content = update.state.doc.toString();
          tab.dirty = true;
        }
      }),
      EditorView.theme({
        '&': { height: "100%" },
        '.cm-scroller': { fontFamily: "var(--font-family)", fontSize: '15px' },
        '.cm-gutters': { userSelect: 'none' }
      }),
    ];
    const filteredExtensions = extensionArr.filter(Boolean);

    const state = EditorState.create({
      doc: tab.content,
      extensions: filteredExtensions
    });
    editors[tab.name] = new EditorView({ state, parent: editorPaneElement });
  } else {
    editorPaneElement.appendChild(editors[tab.name].dom);
  }
  currentEditorView = editors[tab.name];
  setTimeout(() => currentEditorView.focus(), 10);
}

// --- Core Logic ---

function openTab({ name, content, handle, fileHandle, lang = null }) {
  if (!openTabs.some(t => t.name === name)) {
    openTabs.push({ name, content, handle, dirty: false, fileHandle, lang });
  }
  activeTab = name;
  renderTabs();
  renderFileList();
  renderEditor();
}

function switchTab(name) {
  if (!openTabs.some(t => t.name === name)) return;
  activeTab = name;
  renderTabs();
  renderEditor();
}

function closeTab(name) {
  openTabs = openTabs.filter(t => t.name !== name);
  if (editors[name]) { delete editors[name]; }
  if (activeTab === name) {
    activeTab = openTabs.length ? openTabs[openTabs.length - 1].name : null;
  }
  renderTabs();
  renderEditor();
}

function openFileFromFolder(handle, name) {
  handle.getFile().then(file => {
    file.text().then(text => {
      openTab({ name, content: text, handle });
    });
  });
}

function saveFile() {
  if (!activeTab) { alert("No active file."); return; }
  const tab = openTabs.find(t => t.name === activeTab);
  if (!tab) return;
  // Save to disk using File System Access API (if available)
  if (tab.handle && tab.handle.createWritable) {
    tab.handle.createWritable().then(writable => {
      writable.write(tab.content).then(() => {
        writable.close();
        tab.dirty = false;
        alert("File saved!");
      });
    });
  } else {
    // Otherwise: download as a file
    const blob = new Blob([tab.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function openFileDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "*/*";
  input.onchange = async (e) => {
    if (input.files.length > 0) {
      const file = input.files[0];
      const text = await file.text();
      openTab({ name: file.name, content: text, fileHandle: file });
    }
  };
  input.click();
}

async function openFolderDialog() {
  if (!window.showDirectoryPicker) {
    alert("Your browser does not support folder access. Use latest Chrome/Edge.");
    return;
  }
  const dirHandle = await window.showDirectoryPicker();
  folderHandles = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      folderHandles.push({ name: entry.name, handle: entry });
    }
  }
  renderFileList();
}

// --- Drag & Drop ---
window.addEventListener('DOMContentLoaded', () => {
  editorPaneElement = document.getElementById('editor-pane');
  editorPaneElement.ondragover = (e) => { e.preventDefault(); };
  editorPaneElement.ondrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      file.text().then(text => {
        openTab({ name: file.name, content: text, fileHandle: file });
      });
    }
  };
});

// --- Search/Find/Replace ---
function openSearch() {
  if (currentEditorView) {
    openSearchPanel(currentEditorView);
    setTimeout(() => {
      const searchInput = editorPaneElement.querySelector('.cm-search input[type="search"]');
      if (searchInput) searchInput.focus();
    }, 50);
  }
}

// --- Menu Bar Actions ---
function newFile() {
  // Create a blank file and focus
  let fname;
  do {
    fname = `untitled${untitledCount > 1 ? "-" + untitledCount : ""}.txt`;
    untitledCount++;
  } while (openTabs.some(t => t.name === fname));
  openTab({ name: fname, content: "", lang: javascript() });
}

// --- Keyboard Shortcuts & Menu Integration ---
function bindMenuAndShortcuts() {
  // File
  window.openFileDialog = openFileDialog;
  window.openFolderDialog = openFolderDialog;
  window.saveFile = saveFile;
  window.closeTab = closeTab;
  window.activeTab = activeTab;
  window.currentEditorView = currentEditorView;
  window.openSearch = openSearch;

  document.getElementById('menu-new-file')?.addEventListener('click', newFile);
  document.getElementById('menu-open-file')?.addEventListener('click', openFileDialog);
  document.getElementById('menu-open-folder')?.addEventListener('click', openFolderDialog);
  document.getElementById('menu-save-file')?.addEventListener('click', saveFile);
  document.getElementById('menu-close-file')?.addEventListener('click', () => { if (activeTab) closeTab(activeTab); });
  // Edit
  document.getElementById('menu-undo')?.addEventListener('click', () => currentEditorView && undo({ state: currentEditorView.state, dispatch: currentEditorView.dispatch }));
  document.getElementById('menu-redo')?.addEventListener('click', () => currentEditorView && redo({ state: currentEditorView.state, dispatch: currentEditorView.dispatch }));
  document.getElementById('menu-cut')?.addEventListener('click', () => document.execCommand('cut'));
  document.getElementById('menu-copy')?.addEventListener('click', () => document.execCommand('copy'));
  document.getElementById('menu-paste')?.addEventListener('click', () => document.execCommand('paste'));
  document.getElementById('menu-select-all')?.addEventListener('click', () => {
    if (currentEditorView)
      currentEditorView.dispatch({ selection: { anchor: 0, head: currentEditorView.state.doc.length } });
  });
  // Go
  document.getElementById('menu-find')?.addEventListener('click', openSearch);
  document.getElementById('menu-goto-file')?.addEventListener('click', openFileDialog);

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); newFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey) { e.preventDefault(); openFileDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFolderDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTab) closeTab(activeTab); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); }
  });
  
}
// Sidebar Explorer toggle
document.getElementById('sidebar-explorer-toggle')?.addEventListener('click', () => {
  const explorer = document.getElementById('file-explorer-panel');
  if (explorer) explorer.style.display = (explorer.style.display === 'none' ? 'flex' : 'none');
});

// Sidebar Search toggle
document.getElementById('sidebar-search-toggle')?.addEventListener('click', () => {
  openSearch();
});
// --- App Init ---
function initUI() {
  fileListElement = document.getElementById('file-list');
  tabsContainerElement = document.getElementById('tabs-container');
  editorPaneElement = document.getElementById('editor-pane');
  // Blank editor by default, no tabs open
  renderTabs();
  renderFileList();
  renderEditor();
  bindMenuAndShortcuts();
}

// Init on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUI);
} else {
  initUI();
}

function getFileIcon(filename = "") {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case "js": return "mdi-language-javascript";
    case "ts": return "mdi-language-typescript";
    case "html": case "htm": return "mdi-language-html5";
    case "css": return "mdi-language-css3";
    case "json": return "mdi-code-json";
    case "md": return "mdi-language-markdown";
    case "py": return "mdi-language-python";
    case "xml": return "mdi-xml";
    case "txt": return "mdi-file-document-outline";
    case "sh": return "mdi-console-line";
    case "yml": case "yaml": return "mdi-language-yaml";
    case "c": case "cpp": return "mdi-language-cpp";
    case "java": return "mdi-language-java";
    case "php": return "mdi-language-php";
    case "rb": return "mdi-language-ruby";
    case "go": return "mdi-language-go";
    default: return "mdi-file-document-outline";
  }
}

