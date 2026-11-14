const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const vm = require("node:vm");

function event() {
  const listeners = [];
  return { subscribe: (listener) => { listeners.push(listener); return { dispose() {} }; }, fire: (...args) => listeners.forEach((listener) => listener(...args)) };
}

async function setup(update = async () => {}, options = {}) {
  const repoChange = event();
  const editorChange = event();
  const opened = event();
  const closed = event();
  const messages = [];
  const errors = [];
  const commands = {};
  const executed = [];
  let provider;
  let receive;
  let data = options.data || {};
  const repo = { rootUri: { fsPath: "/work/project", toString: () => "/work/project" }, state: { HEAD: { name: "main" }, onDidChange: repoChange.subscribe } };
  const git = { repositories: options.noRepo ? [] : [repo], getRepository: () => git.repositories[0], onDidOpenRepository: opened.subscribe, onDidCloseRepository: closed.subscribe };
  const vscode = {
    extensions: { getExtension: () => ({ activate: async () => ({ getAPI: () => git }) }) },
    window: {
      activeTextEditor: undefined,
      registerWebviewViewProvider: (_, value) => { provider = value; return {}; },
      createStatusBarItem: () => ({ show() {}, hide() {} }),
      onDidChangeActiveTextEditor: editorChange.subscribe,
      showWarningMessage: async () => "Clear",
      showErrorMessage: (message) => errors.push(message),
    },
    StatusBarAlignment: { Left: 1 },
    workspace: { workspaceFolders: options.noFolder ? [] : [{ uri: { fsPath: "/work/project" } }], getWorkspaceFolder: () => undefined, onDidChangeWorkspaceFolders: () => ({}) },
    commands: {
      registerCommand: (name, callback) => { commands[name] = callback; return {}; },
      executeCommand: (name) => { executed.push(name); },
    },
  };
  const originalLoad = Module._load;
  Module._load = function (name, ...args) { return name === "vscode" ? vscode : originalLoad.call(this, name, ...args); };
  let extension;
  try { delete require.cache[require.resolve("../extension")]; extension = require("../extension"); } finally { Module._load = originalLoad; }
  const context = { subscriptions: [], globalState: { get: () => data, update: async (_, value) => { await update(value); data = value; } } };
  await extension.activate(context);
  const view = { webview: { postMessage: (message) => messages.push(message), onDidReceiveMessage: (callback) => { receive = callback; } }, onDidChangeVisibility() {}, onDidDispose() {} };
  provider.resolveWebviewView(view);
  receive({ type: "ready" });
  return { repo, git, opened, repoChange, receive, messages, errors, commands, executed, html: view.webview.html, getData: () => data };
}

test("opens the view from the Command Palette and offers a folder picker in an empty window", async () => {
  const app = await setup(async () => {}, { noRepo: true, noFolder: true });
  assert.equal(app.messages.at(-1).key, null);
  await app.commands["contextpocket.open"]();
  await app.receive({ type: "open-folder" });
  assert.deepEqual(app.executed, ["contextpocket.view.focus", "vscode.openFolder"]);
});

test("moves a project note to the first branch without losing an existing branch note", async () => {
  const app = await setup(async () => {}, { noRepo: true, data: { "/work/project::main": "existing branch note" } });
  assert.equal(app.messages.at(-1).key, "project:/work/project");
  app.receive({ type: "edit", key: "project:/work/project", text: "project note" });
  app.git.repositories.push(app.repo);
  app.opened.fire(app.repo);
  assert.equal(app.messages.at(-1).text, "existing branch note\n\nproject note");
  await new Promise(setImmediate);
  assert.deepEqual(app.getData(), { "/work/project::main": "existing branch note\n\nproject note" });
  app.repo.state.HEAD.name = "other";
  app.repoChange.fire();
  assert.equal(app.messages.at(-1).text, "");
});

test("uses the project scratchpad until a repository has a branch", async () => {
  const app = await setup();
  app.repo.state.HEAD = undefined;
  app.repoChange.fire();
  assert.equal(app.messages.at(-1).key, "project:/work/project");
  app.receive({ type: "edit", key: "project:/work/project", text: "unfinished work" });
  app.repo.state.HEAD = { name: "main" };
  app.repoChange.fire();
  assert.equal(app.messages.at(-1).text, "unfinished work");
  await new Promise(setImmediate);
  assert.equal(app.getData()["/work/project::main"], "unfinished work");
});

test("keeps an edit sent just as Git initializes", async () => {
  const app = await setup(async () => {}, { noRepo: true });
  app.git.repositories.push(app.repo);
  app.opened.fire(app.repo);
  app.receive({ type: "edit", key: "project:/work/project", text: "last project edit" });
  assert.equal(app.messages.at(-1).text, "last project edit");
  await new Promise(setImmediate);
  assert.equal(app.getData()["/work/project::main"], "last project edit");
});

test("keeps notes separate when branches change and saves writes in order", async () => {
  let release;
  let calls = 0;
  const app = await setup(() => ++calls === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve());
  app.receive({ type: "edit", key: "/work/project::main", text: "main context", revision: 1 });
  await new Promise(setImmediate);
  app.repo.state.HEAD.name = "feature";
  app.repoChange.fire();
  assert.equal(app.messages.at(-1).project, "project");
  assert.equal(app.messages.at(-1).text, "");
  app.receive({ type: "edit", key: "/work/project::feature", text: "feature context", revision: 2 });
  app.repo.state.HEAD.name = "main";
  app.repoChange.fire();
  assert.equal(app.messages.at(-1).text, "main context");
  release();
  await new Promise(setImmediate);
  assert.deepEqual(app.getData(), { "/work/project::main": "main context", "/work/project::feature": "feature context" });
  assert.ok(app.messages.some((message) => message.type === "saved" && message.key === "/work/project::main" && message.text === "main context"));
});

test("webview script is valid JavaScript", async () => {
  const app = await setup();
  const script = app.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script[1]));
});

test("reports failed saves and preserves a note if clearing fails", async () => {
  let fail = false;
  const app = await setup(async () => { if (fail) throw new Error("disk error"); });
  app.receive({ type: "edit", key: "/work/project::main", text: "important context", revision: 1 });
  await new Promise(setImmediate);
  fail = true;
  await app.commands["contextpocket.clear"]();
  assert.equal(app.getData()["/work/project::main"], "important context");
  assert.equal(app.messages.at(-1).text, "important context");
  assert.equal(app.messages.at(-1).saveState, "error");
  assert.equal(app.errors.length, 1);
});
