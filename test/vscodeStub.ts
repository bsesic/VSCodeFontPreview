// Minimal stand-in for the `vscode` module so host code can run under node:test.
import * as fs from 'fs';
import Module from 'module';

export class Memento {
  private data = new Map<string, unknown>();
  get<T>(key: string, fallback?: T): T | undefined {
    return this.data.has(key) ? (this.data.get(key) as T) : fallback;
  }
  async update(key: string, value: unknown) {
    this.data.set(key, value);
  }
}

export const calls = { errors: [] as string[], warnings: [] as string[], clipboard: '' };

/** Status bar items, registered commands and the config listener created by `activate`. */
export const ui = {
  workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
  /** Answers for showQuickPick: a function picking items, called once per picker. */
  quickPicks: [] as Array<(items: Array<{ label: string; picked?: boolean }>) => Array<{ label: string }> | undefined>,
  infoAnswers: [] as Array<string | undefined>,
  shownDocuments: [] as string[],
  statusItems: [] as Array<{ text: string; tooltip?: string; command?: string; visible: boolean; alignment: number; priority?: number }>,
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  configListeners: [] as Array<(e: { affectsConfiguration: (key: string) => boolean }) => void>,
};

class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];
  event = (fn: (value: T) => void) => {
    this.listeners.push(fn);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== fn)) };
  };
  fire(value: T) {
    this.listeners.forEach((l) => l(value));
  }
  dispose() {}
}

/** A fake text editor: `text` holds the document, `selections` are [start, end] offsets. */
export const editor = {
  text: '',
  selections: [] as Array<[number, number]>,
  open: false,
};
const fakeDocument = {
  get isClosed() { return !editor.open; },
  languageId: 'html',
  uri: { path: '/work/index.html', scheme: 'file', toString: () => 'file:///work/index.html' },
};
const fakeEditor = {
  document: fakeDocument,
  viewColumn: 1,
  get selections() { return editor.selections; },
  edit: async (fn: (b: { replace: (sel: [number, number], text: string) => void }) => void) => {
    const edits: Array<[[number, number], string]> = [];
    fn({ replace: (sel, text) => edits.push([sel, text]) });
    for (const [[start, end], text] of edits.sort((a, b) => b[0][0] - a[0][0])) {
      editor.text = editor.text.slice(0, start) + text + editor.text.slice(end);
    }
    return true;
  },
};
export let openDialogResult: Array<{ fsPath: string }> | undefined;
export function setOpenDialogResult(files: string[] | undefined) {
  openDialogResult = files?.map((fsPath) => ({ fsPath }));
}

export const config: Record<string, unknown> = {
  catalogUrl: 'https://catalog.test/fonts',
  sampleText: 'Sample',
};

const stub = {
  Uri: {
    file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: [base.fsPath, ...parts].join('/'), scheme: 'file' }),
  },
  EventEmitter,
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Active: -1 },
  commands: {
    registerCommand: (id: string, fn: (...args: unknown[]) => unknown) => {
      ui.commands.set(id, fn);
      return { dispose: () => ui.commands.delete(id) };
    },
    executeCommand: async (id: string, ...args: unknown[]) => ui.commands.get(id)?.(...args),
  },
  Disposable: { from: (...items: Array<{ dispose(): unknown }>) => ({ dispose: () => items.forEach((i) => i.dispose()) }) },
  workspace: {
    onDidCloseTextDocument: () => ({ dispose: () => undefined }),
    onDidChangeConfiguration: (fn: (e: { affectsConfiguration: (key: string) => boolean }) => void) => {
      ui.configListeners.push(fn);
      return { dispose: () => undefined };
    },
    getConfiguration: () => ({ get: (key: string, fallback?: unknown) => (key in config ? config[key] : fallback) }),
    get workspaceFolders() { return ui.workspaceFolders; },
    fs: {
      readFile: async (uri: { fsPath: string }) => new Uint8Array(fs.readFileSync(uri.fsPath)),
      writeFile: async (uri: { fsPath: string }, data: Uint8Array) => fs.writeFileSync(uri.fsPath, data),
      createDirectory: async (uri: { fsPath: string }) => { fs.mkdirSync(uri.fsPath, { recursive: true }); },
    },
  },
  window: {
    showErrorMessage: (message: string) => calls.errors.push(message),
    showWarningMessage: (message: string) => calls.warnings.push(message),
    showInformationMessage: async () => ui.infoAnswers.shift(),
    showQuickPick: async (items: Array<{ label: string; picked?: boolean }>) => ui.quickPicks.shift()?.(items),
    showWorkspaceFolderPick: async () => ui.workspaceFolders[0],
    withProgress: async (_options: unknown, task: (p: { report: () => void }) => Promise<unknown>) => task({ report: () => undefined }),
    get activeTextEditor() { return editor.open ? fakeEditor : undefined; },
    get visibleTextEditors() { return editor.open ? [fakeEditor] : []; },
    showTextDocument: async (doc: { fsPath?: string }) => {
      if (doc?.fsPath) {
        ui.shownDocuments.push(doc.fsPath);
      }
      return fakeEditor;
    },
    onDidChangeActiveTextEditor: () => ({ dispose: () => undefined }),
    createStatusBarItem: (alignment: number, priority?: number) => {
      const item = {
        alignment, priority, text: '', tooltip: undefined as string | undefined, command: undefined as string | undefined, visible: false,
        show() { item.visible = true; },
        hide() { item.visible = false; },
        dispose() {},
      };
      ui.statusItems.push(item);
      return item;
    },
    registerCustomEditorProvider: () => ({ dispose: () => undefined }),
    showOpenDialog: async () => openDialogResult,
    setStatusBarMessage: () => undefined,
  },
  env: { clipboard: { writeText: async (text: string) => { calls.clipboard = text; } } },
};

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'vscode') {
    return 'vscode';
  }
  return originalResolve.call(this, request, ...rest);
};
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: stub } as any;

/** A fake webview that records posted messages and lets tests send messages in. */
export function fakeWebview() {
  const posted: any[] = [];
  let handler: (message: any) => Promise<void> = async () => undefined;
  return {
    posted,
    webview: {
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (uri: { fsPath: string }) => uri.fsPath,
      postMessage: async (message: unknown) => {
        posted.push(message);
        return true;
      },
      onDidReceiveMessage: (fn: (message: any) => Promise<void>) => {
        handler = fn;
        return { dispose: () => undefined };
      },
    },
    send: (message: unknown) => handler(message),
  };
}
