// --- CodeMirror 6 Imports ---
import { EditorState, Compartment, StateEffect } from "@codemirror/state";
import {
    EditorView, keymap, lineNumbers,
    highlightActiveLineGutter, highlightActiveLine,
    dropCursor, rectangularSelection,
    drawSelection,
    highlightSpecialChars,
    crosshairCursor
} from "@codemirror/view";
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

import * as Language from "@codemirror/language";
const {
    defaultHighlightStyle, bracketMatching,
    foldGutter, foldKeymap, codeFolding, indentOnInput, HighlightStyle, syntaxHighlighting
    // 'tags' will be imported directly from @lezer/highlight
} = Language;

// Direct import for 'tags' from @lezer/highlight
import { tags } from "@lezer/highlight";

import { lintKeymap, lintGutter } from "@codemirror/lint";

const initialFiles = [
  {
    name: "index.html",
    icon: "mdi-language-html5",
    langFunction: () => html({ matchClosingTags: true, autoCloseTags: true }),
    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>My Project</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <h1>Hello World!</h1>
    <p>This is a CodeMirror 6 editor. Example: <span class="example">example span</span></p>
    <script type="module" src="app.js"></script>
  </body>
</html>`
  },
  {
    name: "style.css",
    icon: "mdi-language-css3",
    langFunction: css,
    content: `body {\n  background: #f0f0f0;\n  color: #333;\n  font-family: sans-serif;\n  display: flex;\n  flex-direction: column; \n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n  margin: 0;\n  padding: 20px;\n  box-sizing: border-box;\n}\n\nh1 {\n  color: steelblue;\n  margin-bottom: 10px;\n}\n\np {\n  color: #555;\n}`
  },
  {
    name: "app.js",
    icon: "mdi-language-javascript",
    langFunction: javascript,
    content: `// Tip: You can edit this file too!\ndocument.addEventListener('DOMContentLoaded', () => {\n  console.log("Editor Initialized and app.js (this file) is running!");\n});`
  }
];

let currentThemeIsDark = true;
let themeCompartment = new Compartment();
let languageCompartment = new Compartment();

// Use the directly imported 'tags' object
const customLightThemeHighlighter = HighlightStyle.define([
    { tag: tags.keyword, color: "#d73a49" },
    { tag: tags.atom, color: "#6f42c1" },
    { tag: tags.number, color: "#005cc5" },
    { tag: tags.definition(tags.variableName), color: "#24292e", fontWeight: "bold" },
    { tag: tags.variableName, color: "#e36209" },
    { tag: tags.propertyName, color: "#e36209" },
    { tag: tags.attributeName, color: "#6f42c1" },
    { tag: tags.operator, color: "#d73a49" },
    { tag: tags.string, color: "#032f62" },
    { tag: tags.meta, color: "#24292e" },
    { tag: tags.typeName, color: "#22863a", fontWeight: "bold" }, 
    { tag: tags.tagName, color: "#22863a", fontWeight: "bold" }, 
    { tag: tags.comment, color: "#6a737d", fontStyle: "italic" },
    { tag: tags.link, color: "#0366d6", textDecoration: "underline" },
    { tag: tags.invalid, color: "#cb2431" },
    { tag: tags.className, color: "#6f42c1" },
    { tag: tags.constant(tags.variableName), color: "#005cc5" },
    { tag: tags.labelName, color: "#e36209" },
]);

const editorLightTheme = [
    EditorView.theme({
        "&": { color: "#212529", backgroundColor: "#f8f9fa" },
        ".cm-content": { caretColor: "#000" },
        "&.cm-focused .cm-cursor": { borderLeftColor: "#000" },
        "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#cfe2ff", color: "#000" },
        ".cm-gutters": { backgroundColor: "#e9ecef", color: "#495057", borderRight: "1px solid #dee2e6" },
        ".cm-activeLineGutter": { backgroundColor: "#dbe4ff" },
        ".cm-lineNumbers .cm-gutterElement": { color: "#6c757d" },
        ".cm-activeLine": { backgroundColor: "#e7f5ff" },
    }, { dark: false }),
    syntaxHighlighting(customLightThemeHighlighter)
];


function detectLang(filename = "") {
  if (/\.js$/i.test(filename)) return javascript();
  if (/\.html?$/i.test(filename)) return html({ matchClosingTags: true, autoCloseTags: true });
  if (/\.css$/i.test(filename)) return css();
  if (/\.json$/i.test(filename)) return json();
  if (/\.xml$/i.test(filename)) return xml();
  if (/\.md$/i.test(filename)) return markdown({ base: javascript, codeLanguages: languages });
  if (/\.py$/i.test(filename)) return python();
  return [];
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

let openTabs = [];
let activeTabName = null;
let editors = {};
let currentEditorView = null;
let untitledCount = 1;
let currentFolderFiles = [];

let fileListElement, tabsContainerElement, editorPaneElement, fileExplorerPanelElement,
    sidebarExplorerToggleElement, sidebarSearchToggleElement, sidebarSaveFileElement,
    appContainerElement, menuToggleThemeElement;

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
     fileListElement.innerHTML = '<div style="padding: 10px; color: var(--theme-text-secondary); font-style: italic;">Open a folder to see files.</div>';
  }
}

function renderTabs() {
  if (!tabsContainerElement) return;
  tabsContainerElement.innerHTML = "";
  openTabs.forEach(tab => {
    const iconClass = getFileIcon(tab.name);
    const div = document.createElement("div");
    div.className = "tab" + (activeTabName === tab.name ? " active" : "");
    div.dataset.fileName = tab.name;
    div.title = tab.name + (tab.dirty ? " (modified)" : "");
    div.innerHTML = `
      <span class="tab-name-display" data-tab-name="${tab.name}">
        <i class="mdi ${iconClass}"></i>
        <span class="tab-text">${tab.name}</span>
      </span>${tab.dirty ? '*' : ''}
      <span class="close mdi mdi-close" data-tab-name="${tab.name}"></span>`;
    tabsContainerElement.appendChild(div);
  });
}

let isRenaming = false; 

function handleRenameTab(oldName) {
    console.log(`handleRenameTab called for: ${oldName}`);
    if (isRenaming) { 
        console.log("handleRenameTab: Another rename is already in progress.");
        return;
    }

    const tabData = openTabs.find(t => t.name === oldName);
    if (!tabData) {
        console.warn("handleRenameTab: tabData not found for", oldName);
        return;
    }

    const tabDiv = tabsContainerElement.querySelector(`.tab[data-file-name="${CSS.escape(oldName)}"]`);
    if (!tabDiv) {
        console.warn("handleRenameTab: tabDiv not found for", oldName);
        return;
    }

    const tabNameDisplay = tabDiv.querySelector('.tab-name-display');
    if (!tabNameDisplay) {
        console.warn("handleRenameTab: tabNameDisplay not found for", oldName);
        return;
    }
    
    const tabTextSpan = tabNameDisplay.querySelector('.tab-text');
    if (!tabTextSpan) {
        if (tabNameDisplay.querySelector('.tab-name-input')) {
            console.log("handleRenameTab: rename input already present on this tab. Ignoring.");
            return;
        }
        console.warn("handleRenameTab: tabTextSpan not found for", oldName);
        return;
    }

    isRenaming = true; 
    console.log("handleRenameTab: Found tabTextSpan, creating input. isRenaming set to true.");
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-name-input';
    input.value = oldName;

    tabTextSpan.replaceWith(input);
    input.focus();
    input.select();

    const finishRename = () => {
        console.log("finishRename called. Input value:", input.value, "isRenaming was:", isRenaming);
        isRenaming = false; 
        console.log("isRenaming set to false.");

        const newName = input.value.trim();
        const newTabText = document.createElement('span');
        newTabText.className = 'tab-text';
        newTabText.textContent = newName || oldName;

        if (input.parentNode) {
            input.replaceWith(newTabText);
        } else {
            console.warn("Input field for rename was not in DOM during finishRename cleanup.");
        }

        input.removeEventListener('blur', finishRename);
        input.removeEventListener('keydown', handleInputKeydown);

        if (newName && newName !== oldName) {
            if (openTabs.some(t => t.name === newName && t.name !== oldName)) {
                alert(`A file named "${newName}" already exists in the open tabs.`);
                if (newTabText.parentNode) {
                  newTabText.textContent = oldName; 
                } else {
                    renderTabs(); 
                }
                return;
            }
            console.log(`Renaming "${oldName}" to "${newName}"`);
            tabData.name = newName;
            const newLang = detectLang(newName) || [];
            tabData.lang = newLang;

            const folderFileIndex = currentFolderFiles.findIndex(f => f.name === oldName && tabData.handle && f.handle === tabData.handle);
            if (folderFileIndex !== -1) {
                currentFolderFiles[folderFileIndex].name = newName;
            }

            if (editors[oldName]) {
                editors[newName] = editors[oldName];
                delete editors[oldName];
                editors[newName].dispatch({
                    effects: languageCompartment.reconfigure(newLang)
                });
            }
            if (activeTabName === oldName) activeTabName = newName;
            renderTabs();
            renderFileList();
            if (activeTabName === newName && currentEditorView) {
                setTimeout(() => currentEditorView.focus(), 0);
            }
        } else { 
            console.log("Rename cancelled or name unchanged for:", oldName);
            if (!newTabText.parentNode && tabsContainerElement.querySelector(`.tab[data-file-name="${CSS.escape(oldName)}"]`)) {
                renderTabs();
            }
        }
    };

    const handleInputKeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            input.value = oldName; 
            input.blur();
        }
    };
    input.addEventListener('blur', finishRename, { once: true });
    input.addEventListener('keydown', handleInputKeydown);
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
  
  let activeThemeExtensions = currentThemeIsDark ? oneDark : editorLightTheme; 
  let baseHighlighting = [];
  if (!currentThemeIsDark) {
      // For light theme, explicitly add defaultHighlightStyle to ensure classes are applied,
      // which customLightThemeHighlighter can then style.
      baseHighlighting.push(syntaxHighlighting(defaultHighlightStyle, {fallback: true}));
  }


  if (editors[tabData.name]) {
    editorPaneElement.appendChild(editors[tabData.name].dom);
    currentEditorView = editors[tabData.name];
    let effects = [
        themeCompartment.reconfigure(activeThemeExtensions),
        languageCompartment.reconfigure(tabData.lang || detectLang(tabData.name) || [])
    ];
    currentEditorView.dispatch({ effects });
    setTimeout(() => currentEditorView?.focus(), 10);
    return;
  }

  const initialLangExtension = tabData.lang || detectLang(tabData.name) || [];
  let specificFileExtensions = [];
  if (tabData.name.endsWith('.json')) {
      if (typeof jsonParseLinter === 'function') {
          specificFileExtensions.push(jsonParseLinter());
      }
  }

  try {
    const bracketMatchingExtension = (Language && typeof Language.bracketMatching === 'function' ? Language.bracketMatching() : []);
    const foldGutterExtension = (Language && typeof Language.foldGutter === 'function' ? Language.foldGutter({}) : []);
    const codeFoldingExtension = (Language && typeof Language.codeFolding === 'function' ? Language.codeFolding() : []);
    const foldKeymapExtensions = (Language && Language.foldKeymap ? Language.foldKeymap : []);
    const indentOnInputExtension = (Language && typeof Language.indentOnInput === 'function' ? Language.indentOnInput() : []);

    const extensions = [
      themeCompartment.of(activeThemeExtensions), 
      ...baseHighlighting, // Add defaultHighlightStyle for light theme here for NEW editors
      languageCompartment.of(initialLangExtension),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      highlightSpecialChars(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      search({ top: true }),
      highlightSelectionMatches(),
      closeBrackets(),
      bracketMatchingExtension,
      foldGutterExtension,
      codeFoldingExtension,
      indentOnInputExtension,
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
      EditorState.allowMultipleSelections.of(true),
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

// --- Core Application Logic ---

function createNewTab({ name, content = "", handle = null, lang = null, dirty = false }) {
  console.log("createNewTab called for:", name);
  if (openTabs.find(t => t.name === name)) {
    console.log("Tab already exists, switching to:", name);
    switchTab(name);
    return;
  }
  const newTab = { name, content, handle, lang: lang || detectLang(name) || [], dirty };
  openTabs.push(newTab);
  activeTabName = name;
  renderTabs();
  renderFileList();
  renderEditor();
}

function switchTab(tabName) {
  console.log(`switchTab: Called for "${tabName}". Current active: "${activeTabName}"`);
  if (isRenaming) { 
      console.log("switchTab: Rename in progress, switch aborted.");
      return;
  }
  if (!openTabs.find(t => t.name === tabName)) {
    console.warn(`switchTab: Attempted to switch to non-existent tab: "${tabName}"`);
    return;
  }

  const needsTabListUpdate = activeTabName !== tabName;
  activeTabName = tabName;

  if (needsTabListUpdate) {
    console.log(`switchTab: Active tab changed to "${tabName}". Calling renderTabs().`);
    renderTabs();
  } else {
    console.log(`switchTab: Tab "${tabName}" is already active. Not calling renderTabs().`);
  }
  console.log(`switchTab: Calling renderEditor() for "${tabName}".`);
  renderEditor();
}

async function closeTab(tabName) {
  console.log(`closeTab: Called for "${tabName}"`);
   if (isRenaming) { 
      console.log("closeTab: Rename in progress, close aborted.");
      return;
  }
  const tabToClose = openTabs.find(t => t.name === tabName);
  if (tabToClose && tabToClose.dirty) {
    if (!confirm(`File "${tabName}" has unsaved changes. Close anyway?`)) {
      console.log(`closeTab: Close cancelled by user for "${tabName}"`);
      return;
    }
  }

  openTabs = openTabs.filter(t => t.name !== tabName);
  if (editors[tabName]) {
    editors[tabName].destroy();
    delete editors[tabName];
    console.log(`closeTab: Editor for "${tabName}" destroyed.`);
  }

  if (activeTabName === tabName) {
    activeTabName = openTabs.length ? openTabs[openTabs.length - 1].name : null;
    console.log(`closeTab: Active tab was "${tabName}", new active tab: "${activeTabName}"`);
  }
  renderTabs();
  renderEditor();
  console.log(`closeTab: Finished for "${tabName}". Tabs and editor re-rendered.`);
}

async function openFileFromFolder(fileHandle, fileName) {
  console.log(`openFileFromFolder: Called for "${fileName}"`);
  try {
    const existingTab = openTabs.find(tab => tab.name === fileName && tab.handle && typeof tab.handle.isSameEntry === 'function' && typeof fileHandle.isSameEntry === 'function' && tab.handle.isSameEntry(fileHandle));
    if (existingTab) {
        console.log(`openFileFromFolder: Tab for "${fileName}" already exists with same handle. Switching.`);
        switchTab(fileName);
        return;
    }
    const file = await fileHandle.getFile();
    const content = await file.text();
    console.log(`openFileFromFolder: Content read for "${fileName}". Creating new tab.`);
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

  console.log(`saveActiveFile: Saving "${tab.name}"`);
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
    console.log(`saveActiveFile: No file handle for "${tab.name}", using download fallback.`);
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
    const input = document.createElement("input"); input.type = "file"; input.accept = "*/*";
    input.onchange = async () => { if (input.files?.length) { const file = input.files[0]; createNewTab({ name: file.name, content: await file.text(), lang: detectLang(file.name) }); } };
    input.click(); return;
  }
  try {
    const [fileHandle] = await window.showOpenFilePicker({ types: [{ description: 'Text Files', accept: {'text/plain': ['.txt', '.js', '.html', '.css', '.md', '.json', '.py', '.xml', '.log', '.ini', '.cfg', '.ts', '.jsx', '.tsx', '.yaml', '.yml', '.sh', '.c', '.cpp', '.java', '.php', '.rb', '.go' ]} }]});
    const file = await fileHandle.getFile();
    createNewTab({ name: file.name, content: await file.text(), handle: fileHandle, lang: detectLang(file.name) });
  } catch (e) { if (e.name !== 'AbortError') console.error("Error opening file with dialog:", e); }
}

async function handleOpenFolderDialog() {
  if (!window.showDirectoryPicker) { alert("Folder API not supported."); return; }
  try {
    const dirHandle = await window.showDirectoryPicker();
    currentFolderFiles = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") currentFolderFiles.push({ name: entry.name, handle: entry });
    }
    currentFolderFiles.sort((a, b) => a.name.localeCompare(b.name));
    renderFileList();
  } catch (e) { if (e.name !== 'AbortError') console.error("Error opening folder:", e); }
}

function setupDragAndDrop() {
    if (!editorPaneElement && !document.body) return;
    const dropZone = document.body;
    dropZone.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropZone.classList.add('dragover-active'); };
    dropZone.ondragleave = () => dropZone.classList.remove('dragover-active');
    dropZone.ondragend = () => dropZone.classList.remove('dragover-active');
    dropZone.ondrop = async (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover-active');
        const files = e.dataTransfer.files;
        for (const file of files) {
            try { createNewTab({ name: file.name, content: await file.text(), lang: detectLang(file.name) }); }
            catch (err) { console.error("Error reading dropped file:", err); }
        }
    };
}

function handleOpenSearch() {
  if (currentEditorView) openSearchPanel(currentEditorView);
  else alert("Open a file to use search.");
}

function handleNewFile() {
  let newFileName; let count = untitledCount;
  do { newFileName = `untitled${count > 1 ? "-" + count : ""}.txt`; count++; }
  while (openTabs.some(t => t.name === newFileName));
  untitledCount = count;
  console.log("handleNewFile: Creating new tab:", newFileName);
  createNewTab({ name: newFileName, content: "", lang: detectLang(newFileName) });
}

function toggleTheme() {
    currentThemeIsDark = !currentThemeIsDark;
    appContainerElement?.classList.toggle('light-theme', !currentThemeIsDark);
    appContainerElement?.classList.toggle('dark-theme', currentThemeIsDark);
    
    const newThemeExtensions = currentThemeIsDark ? [oneDark] : editorLightTheme; 

    Object.values(editors).forEach(editor => {
        if (editor) { 
            editor.dispatch({ effects: themeCompartment.reconfigure(newThemeExtensions) });
        }
    });
    if (currentEditorView && !Object.values(editors).includes(currentEditorView)) {
         currentEditorView.dispatch({ effects: themeCompartment.reconfigure(newThemeExtensions) });
    }
    console.log(`Theme toggled. Light theme active: ${!currentThemeIsDark}`);
}

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
  document.getElementById('menu-select-all')?.addEventListener('click', () => { if (currentEditorView) currentEditorView.dispatch({ selection: { anchor: 0, head: currentEditorView.state.doc.length } }); });
  document.getElementById('menu-find')?.addEventListener('click', handleOpenSearch);
  menuToggleThemeElement?.addEventListener('click', toggleTheme);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); handleNewFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey) { e.preventDefault(); handleOpenFileDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); handleOpenFolderDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveActiveFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTabName) closeTab(activeTabName); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); handleOpenSearch(); }
  });
}

function setupSidebarToggles() {
    sidebarExplorerToggleElement?.addEventListener('click', () => { if (fileExplorerPanelElement) { const isHidden = fileExplorerPanelElement.style.display === 'none'; fileExplorerPanelElement.style.display = isHidden ? 'flex' : 'none'; sidebarExplorerToggleElement.classList.toggle('active', !isHidden); } });
    sidebarSearchToggleElement?.addEventListener('click', handleOpenSearch);
    sidebarSaveFileElement?.addEventListener('click', saveActiveFile);
}

// Variables for manual double-click detection
let lastClickTime = 0;
let lastClickTarget = null;
const DOUBLE_CLICK_THRESHOLD = 350; // ms

function setupTabEventListeners() {
  if (!tabsContainerElement) {
    console.error("CRITICAL: tabsContainerElement not found for setting up tab event listeners.");
    return;
  }
  console.log("Setting up tab event listeners on:", tabsContainerElement);

  tabsContainerElement.addEventListener('click', function(event) {
    if (isRenaming && event.target.closest('.tab-name-input') !== event.target) {
        console.log('[TAB CLICK] Rename input active, click elsewhere ignored or handled by blur.');
        return;
    }
    
    const tabDiv = event.target.closest('.tab');
    if (!tabDiv) {
      console.log('[TAB CLICK] Click was not inside a .tab element.');
      return;
    }

    const fileName = tabDiv.dataset.fileName;
    if (!fileName) {
      console.log('[TAB CLICK] Tab has no data-file-name attribute.');
      return;
    }

    const tabNameDisplay = event.target.closest('.tab-name-display');
    const closeButton = event.target.closest('.close');

    if (closeButton && closeButton.dataset.tabName === fileName) {
      console.log(`[TAB CLICK] Close button for: "${fileName}"`);
      event.stopPropagation(); 
      closeTab(fileName);
      return; 
    }

    if (tabNameDisplay && tabNameDisplay.dataset.tabName === fileName) {
      const currentTime = new Date().getTime();
      if (currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD && lastClickTarget === tabNameDisplay) {
        console.log(`[TAB DBLCLICK DETECTED] Calling handleRenameTab for: "${fileName}"`);
        event.stopPropagation(); 
        handleRenameTab(fileName);
        lastClickTime = 0; 
        lastClickTarget = null;
      } else {
        console.log(`[TAB CLICK] Single click on tab name display for: "${fileName}". Switching tab.`);
        lastClickTime = currentTime;
        lastClickTarget = tabNameDisplay;
        switchTab(fileName); 
      }
      return; 
    }
    
    if (event.target === tabDiv || tabDiv.contains(event.target)) {
        console.log(`[TAB CLICK] Click on tab body (not name/close). Switching to: "${fileName}"`);
        lastClickTime = 0;
        lastClickTarget = null;
        switchTab(fileName);
    }
  });
}


function initUI() {
  console.log("initUI: Starting UI initialization...");
  fileListElement = document.getElementById('file-list');
  tabsContainerElement = document.getElementById('tabs-container');
  editorPaneElement = document.getElementById('editor-pane');
  fileExplorerPanelElement = document.getElementById('file-explorer-panel');
  sidebarExplorerToggleElement = document.getElementById('sidebar-explorer-toggle');
  sidebarSearchToggleElement = document.getElementById('sidebar-search-toggle');
  sidebarSaveFileElement = document.getElementById('sidebar-save-file');
  appContainerElement = document.getElementById('app-container');
  menuToggleThemeElement = document.getElementById('menu-toggle-theme');

  if (!tabsContainerElement) {
      console.error("CRITICAL FAILURE: tabsContainerElement is null in initUI. Tab functionality will fail.");
  }
  if (!fileListElement || !tabsContainerElement || !editorPaneElement || !fileExplorerPanelElement ||
      !sidebarExplorerToggleElement || !sidebarSearchToggleElement || !appContainerElement || !menuToggleThemeElement ) {
    console.error("One or more UI elements are missing. Check HTML IDs.");
    document.body.innerHTML = "<p style='color:red;'>Error: Critical UI elements missing.</p>";
    return;
  }

  appContainerElement.classList.add(currentThemeIsDark ? 'dark-theme' : 'light-theme');
  renderTabs();
  renderFileList();
  bindMenuAndShortcuts();
  setupSidebarToggles();
  setupDragAndDrop();
  setupTabEventListeners();

  if (Array.isArray(initialFiles) && initialFiles.length > 0) {
     handleNewFile();
  } else {
      handleNewFile();
  }
  console.log("initUI: Initialization complete.");
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('Service Worker registered:', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { initUI(); registerServiceWorker(); });
} else {
  initUI();
  registerServiceWorker();
}