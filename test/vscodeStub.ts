// Minimal stand-in for the `vscode` module so host code can run under node:test.
import * as fs from 'fs';
import Module = require('module');

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

const config: Record<string, unknown> = {
  catalogUrl: 'https://catalog.test/fonts',
  sampleText: 'Sample',
};

const stub = {
  Uri: {
    file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: [base.fsPath, ...parts].join('/') }),
  },
  EventEmitter,
  Disposable: { from: (...items: Array<{ dispose(): unknown }>) => ({ dispose: () => items.forEach((i) => i.dispose()) }) },
  workspace: {
    onDidCloseTextDocument: () => ({ dispose: () => undefined }),
    getConfiguration: () => ({ get: (key: string) => config[key] }),
    fs: { readFile: async (uri: { fsPath: string }) => new Uint8Array(fs.readFileSync(uri.fsPath)) },
  },
  window: {
    showErrorMessage: (message: string) => calls.errors.push(message),
    showWarningMessage: (message: string) => calls.warnings.push(message),
    get activeTextEditor() { return editor.open ? fakeEditor : undefined; },
    get visibleTextEditors() { return editor.open ? [fakeEditor] : []; },
    showTextDocument: async () => fakeEditor,
    onDidChangeActiveTextEditor: () => ({ dispose: () => undefined }),
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
