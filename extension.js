const vscode = require("vscode");
const crypto = require("crypto");
const path = require("path");

function getHtml() {
  const nonce = crypto.randomBytes(16).toString("hex");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { height: 100%; margin: 0; }
  body { padding: 12px; color: var(--vscode-foreground); font: var(--vscode-font-size, 13px) var(--vscode-font-family, sans-serif); }
  .scratchpad { display: flex; flex-direction: column; gap: 10px; height: 100%; }
  .context { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 8px 10px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-contrastBorder, var(--vscode-panel-border, transparent)); border-radius: 8px; }
  .context-icon { display: grid; place-items: center; flex: 0 0 28px; height: 28px; color: var(--vscode-textLink-foreground); background: var(--vscode-textBlockQuote-background); border-radius: 6px; }
  .context-copy { min-width: 0; }
  .project { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .scope { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 11px; overflow-wrap: anywhere; }
  textarea { flex: 1; min-height: 92px; width: 100%; resize: none; padding: 11px 12px; line-height: 1.6; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); border: 1px solid var(--vscode-contrastBorder, var(--vscode-input-border, var(--vscode-panel-border, transparent))); border-radius: 8px; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); }
  textarea::placeholder { color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground)); opacity: 1; }
  :is(textarea, button):focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .save { display: flex; gap: 6px; align-items: center; margin: 0 2px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .save svg { flex: 0 0 12px; }
  .save.error { color: var(--vscode-errorForeground); }
  .empty { padding: 14px 4px; }
  .empty h2 { margin: 0; font-size: 14px; }
  .empty p { margin: 7px 0 14px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
  button { padding: 6px 12px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <main id="scratchpad" class="scratchpad" hidden>
    <header class="context">
      <span class="context-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="4" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v12M18 8c0 5-12 3-12 8"/></svg></span>
      <div class="context-copy">
        <div id="project" class="project"></div>
        <div id="scope" class="scope"></div>
      </div>
    </header>
    <textarea id="note" aria-label="Scratchpad" aria-describedby="scope" placeholder="What did you learn?&#10;What should you try next?" spellcheck="false"></textarea>
    <p id="save" class="save"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span id="save-state" role="status"></span></p>
  </main>
  <section id="empty" class="empty" hidden>
    <h2>Open a folder to start</h2>
    <p>Each folder gets a private scratchpad. In a Git repository, notes follow the branch.</p>
    <button id="open-folder" type="button">Open Folder</button>
  </section>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const note = document.getElementById('note');
  const project = document.getElementById('project');
  const scope = document.getElementById('scope');
  const scratchpad = document.getElementById('scratchpad');
  const empty = document.getElementById('empty');
  const save = document.getElementById('save');
  const saveState = document.getElementById('save-state');
  let key = null;

  function showSaveState(state) {
    saveState.textContent = state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved — edit to retry' : state === 'saved' ? 'Saved locally' : 'Autosaves locally';
    save.classList.toggle('error', state === 'error');
  }

  note.addEventListener('input', () => {
    if (!key) return;
    showSaveState('saving');
    vscode.postMessage({ type: 'edit', key, text: note.value });
  });

  document.getElementById('open-folder').addEventListener('click', () => {
    vscode.postMessage({ type: 'open-folder' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'saved') {
      if (message.key === key && (message.text === note.value || (!message.text.trim() && !note.value.trim()))) showSaveState(message.state);
      return;
    }
    if (message.type !== 'load') return;
    scratchpad.hidden = !message.key;
    empty.hidden = !!message.key;
    project.textContent = message.project || '';
    project.title = message.repoPath || '';
    scope.textContent = message.branch || 'Project scratchpad';
    if (key !== message.key || message.force || (message.replaceText !== undefined && note.value === message.replaceText)) {
      key = message.key;
      note.value = message.text || '';
      showSaveState(message.saveState);
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

async function activate(context) {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt) return;
  const git = (await gitExt.activate()).getAPI(1);
  let notes = { ...context.globalState.get("notes", {}) };
  const saveStates = new Map();
  const versions = new Map();
  const migratedKeys = new Map();
  let pendingSave = Promise.resolve();

  function saveNote(key, text, removeKey) {
    const version = (versions.get(key) || 0) + 1;
    versions.set(key, version);
    if (text.trim() === "") delete notes[key];
    else notes[key] = text;
    if (removeKey) delete notes[removeKey];
    const snapshot = { ...notes };
    saveStates.set(key, "saving");
    updateStatusBar();
    pendingSave = pendingSave.then(async () => {
      try {
        await context.globalState.update("notes", snapshot);
        if (versions.get(key) === version) {
          saveStates.set(key, "saved");
          if (view) view.webview.postMessage({ type: "saved", key, text, state: "saved" });
        }
        return true;
      } catch (error) {
        if (versions.get(key) === version) {
          saveStates.set(key, "error");
          if (view) view.webview.postMessage({ type: "saved", key, text, state: "error" });
        }
        vscode.window.showErrorMessage("Context Pocket couldn't save your note. Edit it to retry.");
        return false;
      }
    });
    return pendingSave;
  }

  const branchOf = (repo) => {
    const head = repo.state.HEAD;
    return head && (head.name || (head.commit ? `detached-${head.commit.slice(0, 7)}` : undefined));
  };

  function currentRepo() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === "file") {
      const repo = git.getRepository(editor.document.uri);
      if (repo) return repo;
      if (vscode.workspace.getWorkspaceFolder(editor.document.uri)) return undefined;
    }
    return git.repositories[0];
  }

  function currentState() {
    const repo = currentRepo();
    const branch = repo && branchOf(repo);
    const editor = vscode.window.activeTextEditor;
    const folder = editor && vscode.workspace.getWorkspaceFolder(editor.document.uri) || (vscode.workspace.workspaceFolders || [])[0];
    const repoPath = repo ? repo.rootUri.fsPath : folder && folder.uri.fsPath;
    const key = repoPath ? branch ? `${repoPath}::${branch}` : `project:${repoPath}` : null;
    const text = key ? notes[key] || "" : "";
    return { key, branch, repoPath, project: repoPath && path.basename(repoPath), text, saveState: saveStates.get(key) || (text ? "saved" : "") };
  }

  let view;
  const push = (force = false, replaceText) => {
    if (view) view.webview.postMessage({ type: "load", ...currentState(), force, replaceText });
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("contextpocket.view", {
      resolveWebviewView(v) {
        view = v;
        v.webview.options = { enableScripts: true };
        v.webview.html = getHtml();
        v.webview.onDidReceiveMessage((msg) => {
          if (msg.type === "ready") push();
          if (msg.type === "open-folder" && !currentState().key) return vscode.commands.executeCommand("vscode.openFolder");
          if (msg.type === "edit" && typeof msg.key === "string" && typeof msg.text === "string") {
            const migrated = migratedKeys.get(msg.key);
            const previousText = migrated && (notes[migrated.key] || "");
            saveNote(migrated ? migrated.key : msg.key, migrated && migrated.prefix ? `${migrated.prefix}\n\n${msg.text}` : msg.text);
            if (migrated && currentState().key === migrated.key) push(false, previousText);
          }
        });
        v.onDidChangeVisibility(() => { if (v.visible) push(); });
        v.onDidDispose(() => { if (view === v) view = undefined; });
      },
    }),
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.name = "Context Pocket";
  status.command = "contextpocket.open";
  context.subscriptions.push(status);

  function updateStatusBar() {
    const state = currentState();
    if (!state.key) {
      status.hide();
      return;
    }
    status.text = `$(note) ${state.text.trim() ? "\u25CF " : ""}${state.branch || state.project}`;
    status.tooltip = state.text.trim() ? "Open your scratchpad" : "No note yet. Click to start one.";
    status.show();
  }

  function refresh() {
    const state = currentState();
    const projectKey = state.repoPath && `project:${state.repoPath}`;
    if (state.branch && notes[projectKey]) {
      const projectText = notes[projectKey];
      const prefix = notes[state.key] || "";
      const text = prefix ? `${prefix}\n\n${projectText}` : projectText;
      migratedKeys.set(projectKey, { key: state.key, prefix });
      saveNote(state.key, text, projectKey);
    } else if (state.branch && projectKey && !migratedKeys.has(projectKey)) {
      migratedKeys.set(projectKey, { key: state.key, prefix: notes[state.key] || "" });
    } else if (!state.branch && projectKey) {
      migratedKeys.delete(projectKey);
    }
    updateStatusBar();
    push();
  }

  const lastBranch = new Map();
  function watch(repo) {
    const id = repo.rootUri.toString();
    lastBranch.set(id, branchOf(repo));
    context.subscriptions.push(repo.state.onDidChange(() => {
      const now = branchOf(repo);
      if (now === lastBranch.get(id)) return;
      lastBranch.set(id, now);
      refresh();
    }));
    refresh();
  }
  git.repositories.forEach(watch);
  context.subscriptions.push(
    git.onDidOpenRepository(watch),
    git.onDidCloseRepository(refresh),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.commands.registerCommand("contextpocket.open", () => vscode.commands.executeCommand("contextpocket.view.focus")),
    vscode.commands.registerCommand("contextpocket.clear", async () => {
      const { key, text } = currentState();
      if (!key || !text) return;
      const choice = await vscode.window.showWarningMessage("Clear this scratchpad?", { modal: true }, "Clear");
      if (choice !== "Clear" || notes[key] !== text) return;
      const save = saveNote(key, "");
      const version = versions.get(key);
      const saved = await save;
      if (versions.get(key) !== version) return;
      if (!saved) notes[key] = text;
      updateStatusBar();
      if (currentState().key === key) push(true);
    }),
  );

  refresh();
}

function deactivate() {}
module.exports = { activate, deactivate };
