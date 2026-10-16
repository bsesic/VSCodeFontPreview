import * as vscode from 'vscode';

// The preview webview takes focus, so the "active" text editor is gone by the
// time the user clicks Insert. Remember the last real text editor instead.

let last: vscode.TextEditor | undefined;
const changed = new vscode.EventEmitter<void>();

/** Fires when the editor that inserts would go to changes. */
export const onDidChangeTarget = changed.event;

export function trackEditors(context: vscode.ExtensionContext) {
  last = vscode.window.activeTextEditor;
  context.subscriptions.push(
    changed,
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.uri.scheme !== 'output') {
        last = editor;
        changed.fire();
      }
    }),
    vscode.workspace.onDidCloseTextDocument(() => changed.fire()),
  );
}

function targetEditor(): vscode.TextEditor | undefined {
  if (last && !last.document.isClosed) {
    // A TextEditor object is replaced when its tab is reopened; prefer the visible one.
    return vscode.window.visibleTextEditors.find((e) => e.document === last!.document) ?? last;
  }
  return vscode.window.visibleTextEditors[0];
}

export interface TargetInfo {
  name: string;
  languageId: string;
}

export function describeTarget(): TargetInfo | undefined {
  const editor = targetEditor();
  if (!editor) {
    return undefined;
  }
  const path = editor.document.uri.path;
  return { name: path.slice(path.lastIndexOf('/') + 1) || editor.document.uri.toString(), languageId: editor.document.languageId };
}

/** Replaces every selection in the target editor with `text`. Returns false when there is no editor. */
export async function insertText(text: string): Promise<boolean> {
  const editor = targetEditor();
  if (!editor) {
    return false;
  }
  const shown = await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: true });
  const selections = shown.selections;
  const ok = await shown.edit((edit) => {
    for (const selection of selections) {
      edit.replace(selection, text);
    }
  });
  last = shown;
  return ok;
}
