import * as vscode from 'vscode';
import { FontSources } from './sources';
import { attachFontPreview, webviewOptions } from './webview';
import { trackEditors } from './editorTarget';

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const sources = new FontSources(context.globalState);
  trackEditors(context);

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.text = '$(text-size) Fonts';
  statusItem.tooltip = 'Open Font Preview';
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
    panel = vscode.window.createWebviewPanel('fontPreview', 'Font Preview', vscode.ViewColumn.Active, {
      ...webviewOptions(context.extensionUri),
      retainContextWhenHidden: true,
    });
    const listener = attachFontPreview(panel.webview, context.extensionUri, sources);
    panel.onDidDispose(() => {
      listener.dispose();
      panel = undefined;
    });
    return panel;
  };

  context.subscriptions.push(
    statusItem,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('fontPreview.showStatusBarItem')) {
        updateStatusItem();
      }
    }),
    vscode.commands.registerCommand('fontPreview.open', openPanel),
    vscode.commands.registerCommand('fontPreview.addFontFile', () => {
      openPanel().webview.postMessage({ type: 'command', command: 'addFile' });
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
        vscode.window.showInformationMessage(`Font Preview: catalog refreshed (${fonts.length} fonts).`);
        panel?.webview.postMessage({ type: 'catalog', fonts });
      } catch (err) {
        vscode.window.showErrorMessage(`Font Preview: ${(err as Error).message}`);
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
