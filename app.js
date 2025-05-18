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
import { languages as cmLanguages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { searchKeymap, highlightSelectionMatches, search, openSearchPanel } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";

import * as Language from "@codemirror/language";
const {
    defaultHighlightStyle, bracketMatching,
    foldGutter, foldKeymap, codeFolding, indentOnInput, HighlightStyle, syntaxHighlighting
} = Language;

import { tags } from "@lezer/highlight";
import { lintKeymap, lintGutter } from "@codemirror/lint";

// --- Initial Files and Theme Configuration ---
const initialFiles = [];

let currentThemeIsDark = true;
let themeCompartment = new Compartment();
let languageCompartment = new Compartment();

// --- User Settings and Autosave ---
const DEFAULT_SETTINGS = {
    theme: 'dark',
    autosaveEnabled: true,
    autosaveInterval: 30000,
};
let userSettings = { ...DEFAULT_SETTINGS };
let autosaveIntervalId = null;

const availableLanguages = [
    { name: "JavaScript", extension: ".js", langFunc: () => javascript() },
    { name: "HTML", extension: ".html", langFunc: () => html({ matchClosingTags: true, autoCloseTags: true }) },
    { name: "CSS", extension: ".css", langFunc: () => css() },
    { name: "JSON", extension: ".json", langFunc: () => json() },
    { name: "Python", extension: ".py", langFunc: () => python() },
    { name: "XML", extension: ".xml", langFunc: () => xml() },
    { name: "Markdown", extension: ".md", langFunc: () => markdown({ base: javascript, codeLanguages: cmLanguages }) },
    { name: "Plain Text", extension: ".txt", langFunc: () => [] }
];

const customLightThemeHighlighter = HighlightStyle.define([
    { tag: tags.keyword, color: "#d73a49" }, { tag: tags.atom, color: "#6f42c1" },
    { tag: tags.number, color: "#005cc5" }, { tag: tags.definition(tags.variableName), color: "#24292e", fontWeight: "bold" },
    { tag: tags.variableName, color: "#e36209" }, { tag: tags.propertyName, color: "#e36209" },
    { tag: tags.attributeName, color: "#6f42c1" }, { tag: tags.operator, color: "#d73a49" },
    { tag: tags.string, color: "#032f62" }, { tag: tags.meta, color: "#24292e" },
    { tag: tags.typeName, color: "#22863a", fontWeight: "bold" }, { tag: tags.tagName, color: "#22863a", fontWeight: "bold" },
    { tag: tags.comment, color: "#6a737d", fontStyle: "italic" }, { tag: tags.link, color: "#0366d6", textDecoration: "underline" },
    { tag: tags.invalid, color: "#cb2431" }, { tag: tags.className, color: "#6f42c1" },
    { tag: tags.constant(tags.variableName), color: "#005cc5" }, { tag: tags.labelName, color: "#e36209" },
]);

const editorLightTheme = [
    EditorView.theme({
        "&": { color: "#212529", backgroundColor: "#f8f9fa" }, ".cm-content": { caretColor: "#000" },
        "&.cm-focused .cm-cursor": { borderLeftColor: "#000" }, "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#cfe2ff", color: "#000" },
        ".cm-gutters": { backgroundColor: "#e9ecef", color: "#495057", borderRight: "1px solid #dee2e6" },
        ".cm-activeLineGutter": { backgroundColor: "#dbe4ff" }, ".cm-lineNumbers .cm-gutterElement": { color: "#6c757d" },
        ".cm-activeLine": { backgroundColor: "#e7f5ff" },
    }, { dark: false }),
    syntaxHighlighting(customLightThemeHighlighter)
];

function detectLang(identifier = "") {
    const langByName = availableLanguages.find(l => l.name.toLowerCase() === identifier.toLowerCase());
    if (langByName) return langByName.langFunc();
    const ext = identifier.split('.').pop().toLowerCase();
    const langByExt = availableLanguages.find(l => l.extension === `.${ext}`);
    if (langByExt) return langByExt.langFunc();
    if (/\.js$/i.test(identifier)) return javascript();
    if (/\.html?$/i.test(identifier)) return html({ matchClosingTags: true, autoCloseTags: true });
    if (/\.css$/i.test(identifier)) return css();
    if (/\.json$/i.test(identifier)) return json();
    if (/\.xml$/i.test(identifier)) return xml();
    if (/\.md$/i.test(identifier)) return markdown({ base: javascript, codeLanguages: cmLanguages });
    if (/\.py$/i.test(identifier)) return python();
    return [];
}

function getFileIcon(filename = "") {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case "js": return "mdi-language-javascript"; case "ts": return "mdi-language-typescript";
    case "html": case "htm": return "mdi-language-html5"; case "css": return "mdi-language-css3";
    case "json": return "mdi-code-json"; case "md": return "mdi-language-markdown";
    case "py": return "mdi-language-python"; case "xml": return "mdi-xml";
    case "txt": return "mdi-file-document-outline"; case "sh": return "mdi-console-line";
    case "yml": case "yaml": return "mdi-language-yaml"; case "c": case "cpp": return "mdi-language-cpp";
    case "java": return "mdi-language-java"; case "php": return "mdi-language-php";
    case "rb": return "mdi-language-ruby"; case "go": return "mdi-language-go";
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
    appContainerElement, menuToggleThemeElement, menuSaveAsElement, menuRenameFileElement,
    statusLanguageElement, statusEncodingElement, statusCursorElement, statusAutosaveElement,
    languageModalBackdrop, languageListContainer,
    menuToggleAutosaveElement, autosaveStatusMenuElement;

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
        <i class="mdi ${iconClass}"></i>
        <span class="tab-text">${tab.name}</span>
      ${tab.dirty ? '*' : ''}
      <span class="close mdi mdi-close" data-tab-name="${tab.name}"></span>`;
    tabsContainerElement.appendChild(div);
  });
}

let isRenaming = false;

function handleRenameTab(oldName) {
    console.log(`[handleRenameTab] Function called for: "${oldName}"`);
    if (isRenaming) {
        console.log("[handleRenameTab] Another rename is already in progress.");
        return;
    }

    const tabData = openTabs.find(t => t.name === oldName);
    if (!tabData) {
        console.warn("[handleRenameTab] tabData not found for", oldName);
        return;
    }

    const tabDiv = tabsContainerElement.querySelector(`.tab[data-file-name="${CSS.escape(oldName)}"]`);
    if (!tabDiv) {
        console.warn("[handleRenameTab] tabDiv not found for", oldName);
        return;
    }

    const tabTextSpan = tabDiv.querySelector('.tab-text');
    const tabIcon = tabDiv.querySelector('i.mdi');

    if (!tabTextSpan) {
        console.warn("[handleRenameTab] .tab-text span not found for", oldName);
        return;
    }
    
    isRenaming = true;

    try {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tab-name-input';
        input.value = oldName;

        // Convert NodeList to Array to use .find()
        const dirtyIndicator = Array.from(tabDiv.childNodes) 
            .find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '*');

        tabTextSpan.style.display = 'none';
        if (dirtyIndicator) dirtyIndicator.style.display = 'none';

        if (tabIcon) {
            tabIcon.after(input);
        } else {
            tabDiv.prepend(input);
        }
        
        input.focus();
        input.select();

        const finishRename = () => {
            isRenaming = false;
            const newName = input.value.trim();
            
            if (input.parentNode) {
                input.remove();
            }
            tabTextSpan.style.display = '';
            if(dirtyIndicator) dirtyIndicator.style.display = '';

            if (newName && newName !== oldName) {
                if (openTabs.some(t => t.name === newName && t !== tabData)) {
                    alert(`A file named "${newName}" already exists in the open tabs.`);
                    renderTabs();
                    return;
                }

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
                updateStatusBar(tabData);
                if (activeTabName === newName && currentEditorView) {
                    setTimeout(() => currentEditorView?.focus(), 0);
                }
            } else {
                if (!newName) renderTabs();
            }
        };
        
        const handleInputKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.value = oldName;
                input.blur();
            }
        };

        input.addEventListener('blur', finishRename, { once: true });
        input.addEventListener('keydown', handleInputKeydown);

    } catch (error) {
        console.error("[handleRenameTab] Error during tab rename input setup:", error);
        isRenaming = false;
        renderTabs();
    }
}

function renderEditor() {
  const tabDataForStatus = openTabs.find(t => t.name === activeTabName);
  updateStatusBar(tabDataForStatus);

  if (!editorPaneElement) return;
  editorPaneElement.innerHTML = "";
  if (!activeTabName) { currentEditorView = null; return; }

  const tabData = openTabs.find(t => t.name === activeTabName);
  if (!tabData) {
    console.error(`Data for active tab "${activeTabName}" not found.`);
    currentEditorView = null;
    return;
  }

  let activeThemeExtensions = userSettings.theme === 'dark' ? oneDark : editorLightTheme;
  let baseHighlighting = [];
  if (userSettings.theme !== 'dark') {
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
      themeCompartment.of(activeThemeExtensions), ...baseHighlighting,
      languageCompartment.of(initialLangExtension), lineNumbers(),
      highlightActiveLineGutter(), highlightActiveLine(), highlightSpecialChars(),
      drawSelection(), dropCursor(), rectangularSelection(), crosshairCursor(),
      search({ top: true }), highlightSelectionMatches(), closeBrackets(),
      bracketMatchingExtension, foldGutterExtension, codeFoldingExtension,
      indentOnInputExtension, lintGutter(), autocompletion(),
      keymap.of([
        ...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap,
        ...searchKeymap, ...completionKeymap, ...lintKeymap,
        ...foldKeymapExtensions, indentWithTab,
      ]),
      EditorState.allowMultipleSelections.of(true), ...specificFileExtensions,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const currentTab = openTabs.find(t => t.name === activeTabName);
          if (currentTab) {
            currentTab.content = update.state.doc.toString();
            if (!currentTab.dirty) {
                currentTab.dirty = true;
                renderTabs();
            }
            if (userSettings.autosaveEnabled) {
                localStorage.setItem('autosave_' + currentTab.name, currentTab.content);
            }
          }
        }
        if (update.selectionSet || update.docChanged) {
            updateCursorPositionStatus(update.state);
        }
      }),
      EditorView.theme({
        '&': { height: "100%" }, '.cm-scroller': { fontFamily: "var(--font-family-editor)", fontSize: '15px' },
        '.cm-gutters': { userSelect: 'none' }
      }),
    ].flat().filter(Boolean);

    const state = EditorState.create({ doc: tabData.content, extensions: extensions });
    editors[tabData.name] = new EditorView({ state, parent: editorPaneElement });
  } catch (error) {
      console.error(`Error creating EditorView for "${tabData.name}":`, error);
      editorPaneElement.textContent = `Error loading editor for ${tabData.name}. Check console.`;
      currentEditorView = null; return;
  }
  currentEditorView = editors[tabData.name];
  updateCursorPositionStatus(currentEditorView.state);
  setTimeout(() => currentEditorView?.focus(), 10);
}

function getLanguageName(langInstance, fileName) {
  if (langInstance && langInstance.language && langInstance.language.name) {
    const name = langInstance.language.name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  const langByExt = availableLanguages.find(l => fileName && l.extension === `.${fileName.split('.').pop().toLowerCase()}`);
  if (langByExt) return langByExt.name;
  return "Plain Text";
}

function updateStatusBar(tabData) {
  if (!statusLanguageElement || !statusEncodingElement || !statusCursorElement) return;
  if (tabData) {
    const langName = getLanguageName(tabData.lang, tabData.name);
    statusLanguageElement.textContent = langName;
    statusEncodingElement.textContent = "UTF-8";
  } else {
    statusLanguageElement.textContent = " "; statusEncodingElement.textContent = " ";
    statusCursorElement.textContent = " ";
  }
}

function updateCursorPositionStatus(state) {
    if (!statusCursorElement || !state) return;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    statusCursorElement.textContent = `Ln ${line.number}, Col ${head - line.from + 1}`;
}

function updateAutosaveStatusDisplay(message = "", isError = false) {
    if (!statusAutosaveElement) return;
    statusAutosaveElement.textContent = message;
    statusAutosaveElement.style.color = isError ? 'var(--theme-error-color, #f44336)' : 'var(--theme-text-secondary)';
    if (message) {
        setTimeout(() => {
            if (statusAutosaveElement.textContent === message) {
                statusAutosaveElement.textContent = "";
            }
        }, 3000);
    }
}

async function createNewTab({ name, content = "", handle = null, lang = null, dirty = false, fromAutosave = false }) {
  console.log("createNewTab called for:", name, "fromAutosave:", fromAutosave);
  const existingTabIndex = openTabs.findIndex(t => t.handle ? (t.handle === handle && t.name === name) : t.name === name);
  if (existingTabIndex !== -1) {
    const existingTab = openTabs[existingTabIndex];
    let canSwitch = true;
    if (existingTab.handle && handle) {
        try {
            if (typeof existingTab.handle.isSameEntry === 'function' && !(await existingTab.handle.isSameEntry(handle))) {
                canSwitch = false;
            }
        } catch (e) { console.warn("Error checking isSameEntry:", e); }
    } else if (existingTab.handle || handle) {
        canSwitch = false;
    }
    if (canSwitch) {
        console.log("Tab already exists (or same file), switching to:", name);
        switchTab(name); return;
    }
  }

  let finalContent = content;
  if (!fromAutosave && userSettings.autosaveEnabled && handle) {
      const autosaveKey = `autosave_filePath_${await getPathForHandle(handle)}`;
      const autosavedContent = localStorage.getItem(autosaveKey);
      if (autosavedContent !== null) {
          if (content !== autosavedContent) {
              if (confirm(`An autosaved version of "${name}" was found. Do you want to restore it?`)) {
                  finalContent = autosavedContent; dirty = true;
                  console.log(`Restored autosaved content for "${name}"`);
              }
          }
      }
  } else if (!fromAutosave && userSettings.autosaveEnabled && !handle) {
      const autosavedContent = localStorage.getItem('autosave_' + name);
       if (autosavedContent !== null) {
          if (content !== autosavedContent) {
              if (confirm(`An autosaved version of "${name}" was found. Do you want to restore it?`)) {
                  finalContent = autosavedContent; dirty = true;
                  console.log(`Restored autosaved content for "${name}"`);
              }
          }
      }
  }

  const newTab = { name, content: finalContent, handle, lang: lang || detectLang(name) || [], dirty };
  openTabs.push(newTab); activeTabName = name;
  renderTabs(); renderFileList(); renderEditor();
}

function switchTab(tabName) {
  if (isRenaming) return;
  if (!openTabs.find(t => t.name === tabName)) return;
  activeTabName = tabName;
  renderTabs(); renderEditor();
}

async function getPathForHandle(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return null;
    try { return handle.name; } catch (e) { return null; }
}

async function closeTab(tabName) {
  console.log(`closeTab: Called for "${tabName}"`);
  if (isRenaming) { return; }
  const tabToCloseIndex = openTabs.findIndex(t => t.name === tabName);
  if (tabToCloseIndex === -1) return;

  const tabToClose = openTabs[tabToCloseIndex];
  if (tabToClose.dirty) {
    if (!confirm(`File "${tabName}" has unsaved changes. Close anyway?`)) return;
  }

  openTabs.splice(tabToCloseIndex, 1);
  if (editors[tabName]) {
    editors[tabName].destroy(); delete editors[tabName];
  }

  if (tabToClose.handle) {
      const autosaveKey = `autosave_filePath_${await getPathForHandle(tabToClose.handle)}`;
      localStorage.removeItem(autosaveKey);
      console.log(`Cleared autosave for handled file: ${tabName} with key ${autosaveKey}`);
  } else {
      localStorage.removeItem('autosave_' + tabName);
      console.log(`Cleared autosave for ${tabName}`);
  }

  if (activeTabName === tabName) {
    activeTabName = openTabs.length ? openTabs[Math.max(0, tabToCloseIndex -1)].name : null;
    if (!activeTabName && openTabs.length > 0) activeTabName = openTabs[0].name;
  }
  renderTabs(); renderEditor();
}

async function openFileFromFolder(fileHandle, fileName) {
  try {
    const existingTab = openTabs.find(async tab => {
        if (tab.handle && typeof tab.handle.isSameEntry === 'function' && typeof fileHandle.isSameEntry === 'function') {
            try { return await tab.handle.isSameEntry(fileHandle); }
            catch (e) { return false; }
        }
        return false;
    });
    if (existingTab) {
        switchTab(existingTab.name); return;
    }
    const file = await fileHandle.getFile();
    const content = await file.text();
    createNewTab({ name: fileName, content, handle: fileHandle, lang: detectLang(fileName) });
  } catch (error) {
    console.error(`Error opening file "${fileName}" from folder:`, error);
    alert(`Could not open file: ${fileName}. Error: ${error.message}`);
  }
}

async function saveActiveFile(isSaveAs = false) {
  if (!activeTabName) { alert("No active file to save."); return false; }
  const tab = openTabs.find(t => t.name === activeTabName);
  if (!tab) { alert("Active tab data not found."); return false; }

  let targetHandle = tab.handle; let targetName = tab.name;

  if (isSaveAs || !targetHandle) {
    if (window.showSaveFilePicker) {
      try {
        const newHandle = await window.showSaveFilePicker({
          suggestedName: targetName,
          types: [{ description: 'Text Files', accept: {'text/plain': ['.txt', '.js', '.html', '.css', '.md', '.json', '.py', '.xml']} }],
        });
        targetHandle = newHandle; targetName = newHandle.name;
      } catch (err) {
        if (err.name === 'AbortError') return false;
        console.error("Error with showSaveFilePicker:", err);
        alert("Could not get file location to save."); return false;
      }
    } else {
      const newNameInput = prompt("Enter new filename:", targetName);
      if (!newNameInput) return false;
      targetName = newNameInput; downloadFile(targetName, tab.content);
      if (tab.name !== targetName) {
          const oldName = tab.name; tab.name = targetName; tab.handle = null;
          tab.lang = detectLang(targetName) || [];
          if (editors[oldName]) {
              editors[targetName] = editors[oldName]; delete editors[oldName];
              editors[targetName].dispatch({ effects: languageCompartment.reconfigure(tab.lang) });
          }
          if (activeTabName === oldName) activeTabName = targetName;
          localStorage.removeItem('autosave_' + oldName);
      }
      tab.dirty = false; localStorage.removeItem('autosave_' + targetName);
      renderTabs(); updateStatusBar(tab); return true;
    }
  }

  if (targetHandle && typeof targetHandle.createWritable === 'function') {
    try {
      const writable = await targetHandle.createWritable();
      await writable.write(tab.content); await writable.close();
      const oldName = tab.name;
      if (oldName !== targetName || (tab.handle && !(await tab.handle.isSameEntry(targetHandle)))) {
          tab.name = targetName; tab.handle = targetHandle;
          tab.lang = detectLang(targetName) || [];
          if (editors[oldName]) {
              editors[targetName] = editors[oldName]; delete editors[oldName];
              editors[targetName].dispatch({ effects: languageCompartment.reconfigure(tab.lang) });
          }
          if (activeTabName === oldName) activeTabName = targetName;
          if (oldName !== targetName) localStorage.removeItem('autosave_' + oldName);
      }
      tab.dirty = false;
      const autosaveKey = `autosave_filePath_${await getPathForHandle(targetHandle)}`;
      localStorage.removeItem(autosaveKey);
      if (!tab.handle) localStorage.removeItem('autosave_' + targetName);
      renderTabs(); renderFileList(); updateStatusBar(tab); return true;
    } catch (error) {
      console.error(`Error saving file "${targetName}":`, error);
      alert(`Could not save file: ${error.message}.`); return false;
    }
  } else {
      downloadFile(targetName, tab.content); tab.dirty = false;
      localStorage.removeItem('autosave_' + targetName);
      renderTabs(); updateStatusBar(tab); return true;
  }
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
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
  do { newFileName = `untitled-${count}.txt`; count++; }
  while (openTabs.some(t => t.name === newFileName));
  untitledCount = count;
  createNewTab({ name: newFileName, content: "", lang: detectLang(newFileName) });
}

function handleSaveAs() { saveActiveFile(true); }

// New handler for the rename menu item
function handleMenuRenameFile() {
    if (isRenaming) {
        console.log("[handleMenuRenameFile] Rename already in progress.");
        return;
    }
    if (!activeTabName) {
        alert("Please select a tab to rename.");
        return;
    }
    // Call the existing rename logic function
    handleRenameTab(activeTabName);
}


function toggleTheme() {
    userSettings.theme = userSettings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(); saveUserSettings();
    console.log(`Theme toggled. Current theme: ${userSettings.theme}`);
}

function applyTheme() {
    currentThemeIsDark = userSettings.theme === 'dark';
    appContainerElement?.classList.toggle('light-theme', !currentThemeIsDark);
    appContainerElement?.classList.toggle('dark-theme', currentThemeIsDark);
    const newThemeExtensions = currentThemeIsDark ? oneDark : editorLightTheme;
    Object.values(editors).forEach(editor => {
        if (editor) editor.dispatch({ effects: themeCompartment.reconfigure(newThemeExtensions) });
    });
}

function bindMenuAndShortcuts() {
  document.getElementById('menu-new-file')?.addEventListener('click', handleNewFile);
  document.getElementById('menu-open-file')?.addEventListener('click', handleOpenFileDialog);
  document.getElementById('menu-open-folder')?.addEventListener('click', handleOpenFolderDialog);
  document.getElementById('menu-save-file')?.addEventListener('click', () => saveActiveFile(false));
  menuSaveAsElement?.addEventListener('click', handleSaveAs);
  menuRenameFileElement?.addEventListener('click', handleMenuRenameFile); // Bind new menu item
  document.getElementById('menu-close-file')?.addEventListener('click', () => { if (activeTabName) closeTab(activeTabName); });
  document.getElementById('menu-undo')?.addEventListener('click', () => currentEditorView && undo({ state: currentEditorView.state, dispatch: currentEditorView.dispatch }));
  document.getElementById('menu-redo')?.addEventListener('click', () => currentEditorView && redo({ state: currentEditorView.state, dispatch: currentEditorView.dispatch }));
  document.getElementById('menu-cut')?.addEventListener('click', () => document.execCommand('cut'));
  document.getElementById('menu-copy')?.addEventListener('click', () => document.execCommand('copy'));
  document.getElementById('menu-paste')?.addEventListener('click', () => document.execCommand('paste'));
  document.getElementById('menu-select-all')?.addEventListener('click', () => { if (currentEditorView) currentEditorView.dispatch({ selection: { anchor: 0, head: currentEditorView.state.doc.length } }); });
  document.getElementById('menu-find')?.addEventListener('click', handleOpenSearch);
  menuToggleThemeElement?.addEventListener('click', toggleTheme);
  menuToggleAutosaveElement?.addEventListener('click', toggleAutosave);

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) handleSaveAs(); else saveActiveFile(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); handleNewFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey) { e.preventDefault(); handleOpenFileDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); handleOpenFolderDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTabName) closeTab(activeTabName); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); handleOpenSearch(); }
    // Optional: Add F2 shortcut for rename
    // if (e.key === 'F2') {
    //     e.preventDefault();
    //     handleMenuRenameFile();
    // }
  });
}

function setupSidebarToggles() {
    sidebarExplorerToggleElement?.addEventListener('click', () => {
        if (fileExplorerPanelElement) {
            const isHidden = fileExplorerPanelElement.style.display === 'none';
            fileExplorerPanelElement.style.display = isHidden ? 'flex' : 'none';
            sidebarExplorerToggleElement.classList.toggle('active', !isHidden);
        }
    });
    sidebarSearchToggleElement?.addEventListener('click', handleOpenSearch);
    sidebarSaveFileElement?.addEventListener('click', () => saveActiveFile(false));
}

function populateLanguageModal() {
    if (!languageListContainer) return;
    languageListContainer.innerHTML = "";
    availableLanguages.forEach(lang => {
        const item = document.createElement('button');
        item.className = 'language-item'; item.textContent = lang.name;
        item.dataset.langName = lang.name;
        item.onclick = () => selectLanguage(lang.name);
        languageListContainer.appendChild(item);
    });
}

function openLanguageChanger() {
    if (!activeTabName) { alert("Please open a file to change its language."); return; }
    populateLanguageModal();
    const modal = document.getElementById('language-modal-backdrop');
    if (modal) modal.classList.add('active');
}

function selectLanguage(languageName) {
    if (!activeTabName || !currentEditorView) return;
    const tab = openTabs.find(t => t.name === activeTabName);
    if (!tab) return;
    const selectedLang = availableLanguages.find(l => l.name === languageName);
    if (!selectedLang) return;
    const newLangExtension = selectedLang.langFunc();
    tab.lang = newLangExtension;
    currentEditorView.dispatch({ effects: languageCompartment.reconfigure(newLangExtension) });
    updateStatusBar(tab);
    const modal = document.getElementById('language-modal-backdrop');
    if (modal) modal.classList.remove('active');
}

function loadUserSettings() {
    try {
        const storedSettings = localStorage.getItem('editorSettings');
        if (storedSettings) {
            const parsed = JSON.parse(storedSettings);
            userSettings = { ...DEFAULT_SETTINGS, ...parsed };
        } else { userSettings = { ...DEFAULT_SETTINGS }; }
    } catch (e) {
        console.error("Error loading user settings:", e);
        userSettings = { ...DEFAULT_SETTINGS };
    }
    console.log("Loaded settings:", userSettings);
    applyTheme(); updateAutosaveMenuText();
    if (userSettings.autosaveEnabled) startAutosave();
}

function saveUserSettings() {
    try {
        localStorage.setItem('editorSettings', JSON.stringify(userSettings));
        console.log("Saved settings:", userSettings);
    } catch (e) { console.error("Error saving user settings:", e); }
}

function toggleAutosave() {
    userSettings.autosaveEnabled = !userSettings.autosaveEnabled;
    saveUserSettings(); updateAutosaveMenuText();
    if (userSettings.autosaveEnabled) {
        startAutosave(); updateAutosaveStatusDisplay("Autosave ON");
    } else {
        stopAutosave(); updateAutosaveStatusDisplay("Autosave OFF");
    }
}

function updateAutosaveMenuText() {
    if (autosaveStatusMenuElement) {
        autosaveStatusMenuElement.textContent = userSettings.autosaveEnabled ? "(On)" : "(Off)";
    }
}

function startAutosave() {
    if (autosaveIntervalId) clearInterval(autosaveIntervalId);
    if (!userSettings.autosaveEnabled || userSettings.autosaveInterval <= 0) return;
    autosaveIntervalId = setInterval(performAutosave, userSettings.autosaveInterval);
    console.log(`Autosave started. Interval: ${userSettings.autosaveInterval / 1000}s`);
}

function stopAutosave() {
    if (autosaveIntervalId) {
        clearInterval(autosaveIntervalId); autosaveIntervalId = null;
        console.log("Autosave stopped.");
    }
}

async function performAutosave() {
    if (!userSettings.autosaveEnabled) return;
    console.log("Performing autosave check...");
    let savedCount = 0;
    for (const tab of openTabs) {
        if (tab.dirty && tab.content) {
            try {
                let autosaveKey = 'autosave_' + tab.name;
                if (tab.handle) {
                    const path = await getPathForHandle(tab.handle);
                    if (path) autosaveKey = `autosave_filePath_${path}`;
                }
                localStorage.setItem(autosaveKey, tab.content);
                console.log(`Autosaved: ${tab.name} to key ${autosaveKey}`);
                savedCount++;
            } catch (e) {
                console.error(`Error autosaving ${tab.name}:`, e);
                if (e.name === 'QuotaExceededError') {
                    updateAutosaveStatusDisplay("Autosave failed: Storage full!", true);
                    stopAutosave(); userSettings.autosaveEnabled = false;
                    saveUserSettings(); updateAutosaveMenuText(); return;
                }
            }
        }
    }
    if (savedCount > 0) updateAutosaveStatusDisplay(`${savedCount} file(s) autosaved`);
}

// Simplified setupTabEventListeners - Double click rename is removed
function setupTabEventListeners() {
  console.log('[setupTabEventListeners] Function called (Rename via Menu).');
  if (!tabsContainerElement) {
    console.error("[setupTabEventListeners] CRITICAL: tabsContainerElement not found.");
    return;
  }
  console.log('[setupTabEventListeners] Attaching click listener to tabsContainerElement.');

  tabsContainerElement.addEventListener('click', function(event) {
    console.log('[Tab Click Listener] Click detected. Target:', event.target);

    // If renaming via input field is active, and click is NOT on input, do nothing.
    // This allows the input's blur event to handle completion.
    if (isRenaming && !event.target.closest('.tab-name-input')) {
        console.log('[Tab Click Listener] Click ignored: Renaming input is active.');
        // Optionally, you could make the input blur here:
        // const activeInput = document.querySelector('.tab-name-input');
        // if (activeInput) activeInput.blur();
        return;
    }

    const tabDiv = event.target.closest('.tab');
    if (!tabDiv) {
      console.log('[Tab Click Listener] Click not on a .tab element.');
      return;
    }
    console.log('[Tab Click Listener] Click on .tab element:', tabDiv);

    const fileName = tabDiv.dataset.fileName;
    if (!fileName) {
      console.log('[Tab Click Listener] Tab has no fileName data attribute.');
      return;
    }
    console.log(`[Tab Click Listener] Tab fileName: "${fileName}"`);

    const closeButton = event.target.closest('.close');
    if (closeButton && closeButton.dataset.tabName === fileName) {
      console.log(`[Tab Click Listener] Close button clicked for tab: "${fileName}"`);
      event.stopPropagation();
      closeTab(fileName);
      return;
    }

    // Any other click on the tab (that's not the close button and not the input field itself)
    // should switch to that tab.
    if (!event.target.closest('.tab-name-input')) { // Ensure click wasn't on an active rename input
        console.log(`[Tab Click Listener] Switching to tab: "${fileName}"`);
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
  menuSaveAsElement = document.getElementById('menu-save-as-file');
  menuRenameFileElement = document.getElementById('menu-rename-file'); // Get new menu item
  statusLanguageElement = document.getElementById('status-language');
  statusEncodingElement = document.getElementById('status-encoding');
  statusCursorElement = document.getElementById('status-cursor');
  statusAutosaveElement = document.getElementById('status-autosave');
  languageModalBackdrop = document.getElementById('language-modal-backdrop');
  languageListContainer = document.getElementById('language-list-container');
  menuToggleAutosaveElement = document.getElementById('menu-toggle-autosave');
  autosaveStatusMenuElement = document.getElementById('autosave-status-menu');

  const criticalElements = [
        {name: 'fileListElement', el: fileListElement}, {name: 'tabsContainerElement', el: tabsContainerElement},
        {name: 'editorPaneElement', el: editorPaneElement}, {name: 'fileExplorerPanelElement', el: fileExplorerPanelElement},
        {name: 'sidebarExplorerToggleElement', el: sidebarExplorerToggleElement}, {name: 'sidebarSearchToggleElement', el: sidebarSearchToggleElement},
        {name: 'sidebarSaveFileElement', el: sidebarSaveFileElement}, {name: 'appContainerElement', el: appContainerElement},
        {name: 'menuToggleThemeElement', el: menuToggleThemeElement}, {name: 'menuSaveAsElement', el: menuSaveAsElement},
        {name: 'menuRenameFileElement', el: menuRenameFileElement}, // Check new menu item
        {name: 'statusLanguageElement', el: statusLanguageElement}, {name: 'statusEncodingElement', el: statusEncodingElement},
        {name: 'statusCursorElement', el: statusCursorElement}, {name: 'statusAutosaveElement', el: statusAutosaveElement},
        {name: 'languageModalBackdrop', el: languageModalBackdrop}, {name: 'languageListContainer', el: languageListContainer},
        {name: 'menuToggleAutosaveElement', el: menuToggleAutosaveElement}, {name: 'autosaveStatusMenuElement', el: autosaveStatusMenuElement}
  ];
  const missingElements = criticalElements.filter(item => !item.el).map(item => item.name).join(', ');

  if (missingElements) {
    console.error(`One or more UI elements are missing. Check HTML IDs. Missing: ${missingElements}`);
    document.body.innerHTML = "<p style='color:red;'>Error: Critical UI elements missing. Application cannot start. Check console for details.</p>";
    return;
  }

  loadUserSettings();
  statusLanguageElement.addEventListener('click', openLanguageChanger);
  renderTabs();
  renderFileList();
  bindMenuAndShortcuts(); // This will bind the new rename menu item
  setupSidebarToggles();
  setupDragAndDrop();
  setupTabEventListeners(); // This is now the simplified version

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