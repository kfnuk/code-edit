// --- CodeMirror 6 Imports ---
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, dropCursor, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { searchKeymap, highlightSelectionMatches, search, openSearchPanel } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";

// Import the entire @codemirror/language module as 'Language'
// ALL utilities from this package (defaultHighlightStyle, bracketMatching, foldGutter, etc.)
// will be accessed via this 'Language' namespace object.
import * as Language from "@codemirror/language";

import { lintKeymap, lintGutter } from "@codemirror/lint";

// --- Debugging: Log the @codemirror/language module exports ---
console.log("Inspecting @codemirror/language module (imported as 'Language'):", Language);
if (Language && Language.defaultHighlightStyle) {
    console.log("'Language.defaultHighlightStyle' IS available.");
} else {
    console.error("'Language.defaultHighlightStyle' IS MISSING!");
}
if (Language && typeof Language.bracketMatching === 'function') {
    console.log("'Language.bracketMatching()' IS available.");
} else {
    console.error("'Language.bracketMatching()' IS MISSING!");
}
if (Language && typeof Language.foldGutter === 'function') {
    console.log("'Language.foldGutter()' IS available.");
} else {
    console.error("'Language.foldGutter()' IS MISSING!");
}
if (Language && typeof Language.codeFolding === 'function') {
    console.log("'Language.codeFolding()' IS available.");
} else {
    console.error("'Language.codeFolding()' IS MISSING!");
}
if (Language && Language.foldKeymap) {
    console.log("'Language.foldKeymap' IS available.");
} else {
    console.error("'Language.foldKeymap' IS MISSING!");
}


// --- Helpers ---
function detectLang(filename = "") {
  if (/\.js$/i.test(filename)) return javascript();
  if (/\.html?$/i.test(filename)) return html({ matchClosingTags: true, autoCloseTags: true });
  if (/\.css$/i.test(filename)) return css();
  if (/\.json$/i.test(filename)) return json();
  if (/\.xml$/i.test(filename)) return xml();
  if (/\.md$/i.test(filename)) return markdown({ base: javascript, codeLanguages: languages });
  if (/\.py$/i.test(filename)) return python();
  console.warn(`No specific language support for ${filename}, using empty extension set.`);
  return []; // Return empty array if no specific language detected
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

// --- State ---
let openTabs = [];       // Array of tab objects: {name, content, dirty, handle, lang}
let activeTabName = null;    // filename (string)
let editors = {};        // filename: EditorView instance
let currentEditorView = null;
let untitledCount = 1;
let currentFolderFiles = []; // { name: string, handle: FileSystemFileHandle }


// --- DOM Elements ---
let fileListElement, tabsContainerElement, editorPaneElement, fileExplorerPanelElement,
    sidebarExplorerToggleElement, sidebarSearchToggleElement, sidebarSaveFileElement;


// --- UI Rendering ---

function renderFileList() {
  if (!fileListElement) return;
  fileListElement.innerHTML = "";
  if (currentFolderFiles.length > 0) {
    currentFolderFiles.forEach(file => {
      const div = document.createElement("div");
      div.className = "file" + (activeTabName === file.name ? " active" : "");
      div.innerHTML = `<i class="mdi ${getFileIcon(file.name)}"></i> ${file.name}`;
      div.title = file.name;
      div.onclick = () => openFileFromFolder(file.handle, file.name);
      fileListElement.appendChild(div);
    });
  } else {
     fileListElement.innerHTML = '<div style="padding: 10px; color: var(--vscode-text-secondary); font-style: italic;">Open a folder to see files.</div>';
  }
}

function renderTabs() {
  if (!tabsContainerElement) return;
  tabsContainerElement.innerHTML = "";
  openTabs.forEach(tab => {
    const iconClass = getFileIcon(tab.name);
    const div = document.createElement("div");
    div.className = "tab" + (activeTabName === tab.name ? " active" : "");
    div.title = tab.name + (tab.dirty ? " (modified)" : "");
    div.innerHTML = `<i class="mdi ${iconClass}"></i> ${tab.name}${tab.dirty ? '*' : ''} <span class="close mdi mdi-close" title="Close ${tab.name}"></span>`;
    div.addEventListener("click", (event) => {
      if (event.target.classList.contains("close")) {
        event.stopPropagation();
        closeTab(tab.name);
      } else {
        switchTab(tab.name);
      }
    });
    tabsContainerElement.appendChild(div);
  });
}


function renderEditor() {
  if (!editorPaneElement) return;
  editorPaneElement.innerHTML = "";
  if (!activeTabName) { currentEditorView = null; return; }
  
  const tabData = openTabs.find(t => t.name === activeTabName);
  if (!tabData) { 
    console.error(`Data for active tab "${activeTabName}" not found.`);
    currentEditorView = null; 
    return; 
  }

  if (editors[tabData.name]) {
    editorPaneElement.appendChild(editors[tabData.name].dom);
    currentEditorView = editors[tabData.name];
    setTimeout(() => currentEditorView?.focus(), 10);
    return;
  }
  
  const langExtension = tabData.lang || detectLang(tabData.name) || [];
  let specificFileExtensions = [];
  if (tabData.name.endsWith('.json')) {
      if (typeof jsonParseLinter === 'function') {
          specificFileExtensions.push(jsonParseLinter());
      } else {
          console.warn("jsonParseLinter is not available. JSON linting disabled.");
      }
  }

  try {
    // Access ALL @codemirror/language exports via the 'Language' namespace
    const defaultHighlightStyleFallback = (Language && Language.defaultHighlightStyle && Language.defaultHighlightStyle.fallback !== undefined) ? Language.defaultHighlightStyle.fallback : [];
    const bracketMatchingExtension = (Language && typeof Language.bracketMatching === 'function' ? Language.bracketMatching() : []);
    const foldGutterExtension = (Language && typeof Language.foldGutter === 'function' ? Language.foldGutter({}) : []);
    const codeFoldingExtension = (Language && typeof Language.codeFolding === 'function' ? Language.codeFolding() : []);
    const foldKeymapExtensions = (Language && Language.foldKeymap ? Language.foldKeymap : []);


    const extensions = [
      oneDark,
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      dropCursor(),
      rectangularSelection(),
      defaultHighlightStyleFallback, 
      search({ top: true }),
      highlightSelectionMatches(),
      closeBrackets(),
      bracketMatchingExtension, 
      foldGutterExtension,
      codeFoldingExtension, 
      lintGutter(),
      autocompletion(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...lintKeymap,
        ...foldKeymapExtensions, 
        indentWithTab,
      ]),
      langExtension, 
      ...specificFileExtensions,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const currentTab = openTabs.find(t => t.name === activeTabName);
          if (currentTab) {
            currentTab.content = update.state.doc.toString();
            if (!currentTab.dirty) {
                currentTab.dirty = true;
                renderTabs(); 
            }
          }
        }
      }),
      EditorView.theme({
        '&': { height: "100%" },
        '.cm-scroller': { fontFamily: "var(--font-family-editor)", fontSize: '15px' },
        '.cm-gutters': { userSelect: 'none' }
      }),
    ].flat().filter(Boolean); 

    const state = EditorState.create({
      doc: tabData.content,
      extensions: extensions
    });
    editors[tabData.name] = new EditorView({ state, parent: editorPaneElement });
  } catch (error) {
      console.error(`Error creating EditorView for "${tabData.name}":`, error);
      editorPaneElement.textContent = `Error loading editor for ${tabData.name}. Check console.`;
      currentEditorView = null;
      return;
  }

  currentEditorView = editors[tabData.name];
  setTimeout(() => currentEditorView?.focus(), 10);
}

// --- Core Logic --- (Remains the same as previous version)

function createNewTab({ name, content = "", handle = null, lang = null, dirty = false }) {
  if (openTabs.find(t => t.name === name)) {
    switchTab(name);
    return;
  }
  const newTab = {
    name,
    content,
    handle, 
    lang: lang || detectLang(name) || [],
    dirty
  };
  openTabs.push(newTab);
  activeTabName = name;
  renderTabs();
  renderFileList(); 
  renderEditor();
}

function switchTab(tabName) {
  if (!openTabs.find(t => t.name === tabName)) {
    console.warn(`Attempted to switch to non-existent tab: ${tabName}`);
    return;
  }
  activeTabName = tabName;
  renderTabs(); 
  renderEditor(); 
}

async function closeTab(tabName) {
  const tabToClose = openTabs.find(t => t.name === tabName);
  if (tabToClose && tabToClose.dirty) {
    if (!confirm(`File "${tabName}" has unsaved changes. Close anyway?`)) {
      return; 
    }
  }

  openTabs = openTabs.filter(t => t.name !== tabName);
  if (editors[tabName]) {
    editors[tabName].destroy(); 
    delete editors[tabName];
  }

  if (activeTabName === tabName) {
    activeTabName = openTabs.length ? openTabs[openTabs.length - 1].name : null;
  }
  renderTabs();
  renderEditor(); 
}

async function openFileFromFolder(fileHandle, fileName) {
  try {
    const file = await fileHandle.getFile();
    const content = await file.text();
    createNewTab({ name: fileName, content, handle: fileHandle, lang: detectLang(fileName) });
  } catch (error) {
    console.error(`Error opening file "${fileName}" from folder:`, error);
    alert(`Could not open file: ${fileName}. Error: ${error.message}`);
  }
}

async function saveActiveFile() {
  if (!activeTabName) { alert("No active file to save."); return; }
  const tab = openTabs.find(t => t.name === activeTabName);
  if (!tab) { alert("Active tab data not found."); return; }

  if (tab.handle && typeof tab.handle.createWritable === 'function') { 
    try {
      const writable = await tab.handle.createWritable();
      await writable.write(tab.content);
      await writable.close();
      tab.dirty = false;
      renderTabs(); 
      console.log(`File "${tab.name}" saved successfully via File System Access API.`);
    } catch (error) {
      console.error(`Error saving file "${tab.name}" via File System Access API:`, error);
      alert(`Could not save file: ${error.message}. Try downloading instead.`);
      downloadFile(tab.name, tab.content); 
    }
  } else { 
    downloadFile(tab.name, tab.content);
    tab.dirty = false; 
    renderTabs();
  }
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`File "${filename}" downloaded.`);
}

async function handleOpenFileDialog() {
  if (!window.showOpenFilePicker) {
    alert("Your browser does not support the File System Access API for opening files. Please use a modern browser like Chrome or Edge.");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*"; 
    input.onchange = async (e) => {
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            try {
                const text = await file.text();
                createNewTab({ name: file.name, content: text, lang: detectLang(file.name) });
            } catch (readError) {
                console.error("Error reading file from input:", readError);
                alert(`Could not read file: ${file.name}`);
            }
        }
    };
    input.click();
    return;
  }
  try {
    const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Text Files', accept: {'text/plain': ['.txt', '.js', '.html', '.css', '.md', '.json', '.py', '.xml', '.log', '.ini', '.cfg', '.ts', '.jsx', '.tsx', '.yaml', '.yml', '.sh', '.c', '.cpp', '.java', '.php', '.rb', '.go' ]} }],
        multiple: false
    });
    const file = await fileHandle.getFile();
    const content = await file.text();
    createNewTab({ name: file.name, content, handle: fileHandle, lang: detectLang(file.name) });
  } catch (error) {
    if (error.name === 'AbortError') {
        console.log('File open dialog aborted by user.');
    } else {
        console.error("Error opening file with dialog:", error);
        alert(`Could not open file. Error: ${error.message}`);
    }
  }
}

async function handleOpenFolderDialog() {
  if (!window.showDirectoryPicker) {
    alert("Your browser does not support the File System Access API for opening folders. Please use a modern browser like Chrome or Edge.");
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker();
    currentFolderFiles = []; 
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") {
        currentFolderFiles.push({ name: entry.name, handle: entry });
      }
    }
    currentFolderFiles.sort((a, b) => a.name.localeCompare(b.name)); 
    renderFileList(); 
  } catch (error) {
     if (error.name === 'AbortError') {
        console.log('Folder open dialog aborted by user.');
    } else {
        console.error("Error opening folder:", error);
        alert(`Could not open folder. Error: ${error.message}`);
    }
  }
}

// --- Drag & Drop ---
function setupDragAndDrop() {
    if (!editorPaneElement && !document.body) return; 
    const dropZone = document.body; 

    dropZone.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy'; 
        dropZone.classList.add('dragover-active'); 
    };
    dropZone.ondragleave = () => {
        dropZone.classList.remove('dragover-active');
    };
    dropZone.ondragend = () => { 
        dropZone.classList.remove('dragover-active');
    };

    dropZone.ondrop = async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover-active');

        if (e.dataTransfer.items) {
            for (const item of e.dataTransfer.items) {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        try {
                            const content = await file.text();
                            createNewTab({ name: file.name, content, lang: detectLang(file.name) });
                        } catch (readError) {
                            console.error("Error reading dropped file:", readError);
                            alert(`Could not read file: ${file.name}`);
                        }
                    }
                }
            }
        } else { 
            for (const file of e.dataTransfer.files) {
                 try {
                    const content = await file.text();
                    createNewTab({ name: file.name, content, lang: detectLang(file.name) });
                } catch (readError) {
                    console.error("Error reading dropped file (fallback):", readError);
                    alert(`Could not read file: ${file.name}`);
                }
            }
        }
    };
}

// --- Search/Find/Replace ---
function handleOpenSearch() {
  if (currentEditorView) {
    openSearchPanel(currentEditorView);
    setTimeout(() => {
      const searchInput = editorPaneElement?.querySelector('.cm-search input[type="search"]');
      if (searchInput) searchInput.focus();
    }, 50);
  } else {
    alert("Open a file to use search.");
  }
}

// --- Menu Bar Actions ---
function handleNewFile() {
  let newFileName;
  let count = untitledCount; 
  do {
    newFileName = `untitled${count > 1 ? "-" + count : ""}.txt`;
    count++;
  } while (openTabs.some(t => t.name === newFileName));
  untitledCount = count; 

  createNewTab({ name: newFileName, content: "", lang: detectLang(newFileName) });
}

// --- Keyboard Shortcuts & Menu Integration ---
function bindMenuAndShortcuts() {
  document.getElementById('menu-new-file')?.addEventListener('click', handleNewFile);
  document.getElementById('menu-open-file')?.addEventListener('click', handleOpenFileDialog);
  document.getElementById('menu-open-folder')?.addEventListener('click', handleOpenFolderDialog);
  document.getElementById('menu-save-file')?.addEventListener('click', saveActiveFile);
  document.getElementById('menu-close-file')?.addEventListener('click', () => { if (activeTabName) closeTab(activeTabName); });

  document.getElementById('menu-undo')?.addEventListener('click', () => currentEditorView && undo({ state: currentEditorView.state, dispatch: currentEditorView.dispatch }));
  document.getElementById('menu-redo')?.addEventListener('click', () => currentEditorView && redo({ state: currentEditorView.state, dispatch: currentEditorView.dispatch }));
  document.getElementById('menu-cut')?.addEventListener('click', () => document.execCommand('cut')); 
  document.getElementById('menu-copy')?.addEventListener('click', () => document.execCommand('copy'));
  document.getElementById('menu-paste')?.addEventListener('click', () => document.execCommand('paste'));
  document.getElementById('menu-select-all')?.addEventListener('click', () => {
    if (currentEditorView) {
      currentEditorView.dispatch({ selection: { anchor: 0, head: currentEditorView.state.doc.length } });
    }
  });

  document.getElementById('menu-find')?.addEventListener('click', handleOpenSearch);

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); handleNewFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey) { e.preventDefault(); handleOpenFileDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); handleOpenFolderDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveActiveFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTabName) closeTab(activeTabName); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); handleOpenSearch(); }
  });
}

// --- Sidebar Toggles ---
function setupSidebarToggles() {
    if (sidebarExplorerToggleElement) {
        sidebarExplorerToggleElement.onclick = () => {
            if (fileExplorerPanelElement) {
                const isHidden = fileExplorerPanelElement.style.display === 'none';
                fileExplorerPanelElement.style.display = isHidden ? 'flex' : 'none';
                sidebarExplorerToggleElement.classList.toggle('active', !isHidden);
            }
        };
    }
    if (sidebarSearchToggleElement) {
        sidebarSearchToggleElement.onclick = handleOpenSearch;
    }
    if (sidebarSaveFileElement) { 
        sidebarSaveFileElement.onclick = saveActiveFile;
    }
}

// --- App Init ---
function initUI() {
  fileListElement = document.getElementById('file-list');
  tabsContainerElement = document.getElementById('tabs-container');
  editorPaneElement = document.getElementById('editor-pane');
  fileExplorerPanelElement = document.getElementById('file-explorer-panel');
  sidebarExplorerToggleElement = document.getElementById('sidebar-explorer-toggle');
  sidebarSearchToggleElement = document.getElementById('sidebar-search-toggle');
  sidebarSaveFileElement = document.getElementById('sidebar-save-file'); 

  if (!fileListElement || !tabsContainerElement || !editorPaneElement || !fileExplorerPanelElement || 
      !sidebarExplorerToggleElement || !sidebarSearchToggleElement ) {
    console.error("One or more UI elements are missing. Check HTML IDs.");
    document.body.innerHTML = "<p style='color:red; font-family: sans-serif; padding: 20px;'>Error: UI elements missing. App cannot start. Check console.</p>";
    return;
  }

  renderTabs(); 
  renderFileList(); 
  renderEditor(); 
  
  bindMenuAndShortcuts();
  setupSidebarToggles();
  setupDragAndDrop(); 
}

// --- PWA Service Worker Registration ---
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js') 
        .then((registration) => {
          console.log('Service Worker registered successfully with scope:', registration.scope);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    });
  } else {
    console.log('Service Worker is not supported by this browser.');
  }
}

// --- DOM Ready - Initialize UI and Service Worker ---
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initUI();
    registerServiceWorker();
  });
} else { 
  initUI();
  registerServiceWorker();
}
