import * as vscode from 'vscode';
import { FontSources } from './sources';
import { attachFontPreview, webviewOptions } from './webview';
import { trackEditors } from './editorTarget';
import { familyAtCursor } from './cursorFont';

let panel: vscode.WebviewPanel | undefined;
/** Messages for the panel's webview, held until it has started. */
let queued: unknown[] | undefined;

export function activate(context: vscode.ExtensionContext) {
  const sources = new FontSources(context.globalState);
  trackEditors(context);

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.text = `$(text-size) ${vscode.l10n.t('Fonts')}`;
  statusItem.tooltip = vscode.l10n.t('Open Font Studio');
  statusItem.command = 'fontPreview.open';
  const updateStatusItem = (): void => {
    if (vscode.workspace.getConfiguration('fontPreview').get<boolean>('showStatusBarItem', true)) {
      statusItem.show();
    } else {
      statusItem.hide();
    }
  };
  updateStatusItem();

  const openPanel = (): vscode.WebviewPanel => {
    if (panel) {
      panel.reveal();
      return panel;
    }
    panel = vscode.window.createWebviewPanel('fontPreview', 'Font Studio', vscode.ViewColumn.Active, {
      ...webviewOptions(context.extensionUri),
      retainContextWhenHidden: true,
    });
    queued = [];
    const webview = panel.webview;
    const listener = attachFontPreview(webview, context.extensionUri, sources, {
      onReady: () => {
        queued?.forEach((message) => webview.postMessage(message));
        queued = undefined;
      },
    });
    panel.onDidDispose(() => {
      listener.dispose();
      panel = undefined;
      queued = undefined;
    });
    return panel;
  };

  /** Opens the panel and runs a webview command once the webview is ready. */
  const runInPanel = (message: { type: 'command'; command: string; [key: string]: unknown }): void => {
    const target = openPanel();
    if (queued) {
      queued.push(message);
    } else {
      target.webview.postMessage(message);
    }
  };

  context.subscriptions.push(
    statusItem,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('fontPreview.showStatusBarItem')) {
        updateStatusItem();
      }
    }),
    vscode.commands.registerCommand('fontPreview.open', openPanel),
    vscode.commands.registerCommand('fontPreview.addFontFile', () => runInPanel({ type: 'command', command: 'addFile' })),
    vscode.commands.registerCommand('fontPreview.insertIcon', () => runInPanel({ type: 'command', command: 'showIcons' })),
    vscode.commands.registerCommand('fontPreview.previewFontAtCursor', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const { selection, document } = editor;
      const family = selection.isEmpty
        ? familyAtCursor(document.lineAt(selection.active.line).text, selection.active.character)
        : familyAtCursor(document.getText(selection), 0);
      if (!family) {
        vscode.window.showWarningMessage(vscode.l10n.t('Font Studio: no font family found at the cursor.'));
        return;
      }
      runInPanel({ type: 'command', command: 'inspectFamily', family });
    }),
    vscode.commands.registerCommand('fontPreview.previewFontFile', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) {
        vscode.commands.executeCommand('vscode.openWith', target, FontFileEditor.viewType);
      }
    }),
    vscode.commands.registerCommand('fontPreview.refreshCatalog', async () => {
      try {
        const fonts = await sources.catalog(true);
        vscode.window.showInformationMessage(vscode.l10n.t('Font Studio: catalog refreshed ({0} fonts).', fonts.length));
        panel?.webview.postMessage({ type: 'catalog', fonts });
      } catch (err) {
        vscode.window.showErrorMessage(`Font Studio: ${(err as Error).message}`);
      }
    }),
    vscode.window.registerCustomEditorProvider(FontFileEditor.viewType, new FontFileEditor(context, sources), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
  );
}

/** Opens .ttf/.otf/.woff/.woff2 files directly in the font preview. */
class FontFileEditor implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = 'fontPreview.fontFile';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sources: FontSources,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): void {
    webviewPanel.webview.options = webviewOptions(this.context.extensionUri);
    const listener = attachFontPreview(webviewPanel.webview, this.context.extensionUri, this.sources, {
      file: document.uri,
    });
    webviewPanel.onDidDispose(() => listener.dispose());
  }
}

export function deactivate() {}
