import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { CustomFontRef, FontSources, LoadedFont, labelFromLocation, systemFamilies } from './sources';
import { ICON_SETS } from './iconSets';
import { fontsourceFaces } from './fontDetails';
import { ProjectFontRequest, addFontToProject } from './projectFonts';
import { describeTarget, insertText, onDidChangeTarget } from './editorTarget';

/** Messages the webview sends to the extension. */
type FromWebview =
  | { type: 'ready' }
  | { type: 'catalog'; force?: boolean }
  | { type: 'addFile' }
  | { type: 'addUrl'; url: string; label?: string }
  | { type: 'addSystem'; family: string }
  | { type: 'keep'; font: CustomFontRef }
  | { type: 'remove'; id: string }
  | { type: 'systemFonts' }
  | { type: 'copy'; text: string; what: string }
  | { type: 'icons'; set: string; force?: boolean }
  | { type: 'target' }
  | { type: 'insert'; text: string; what: string }
  | { type: 'fontDetails'; id: number; source: 'google' | 'fontsource'; fontId: string; family: string }
  | { type: 'fontsourceFaces'; id: number; fontId: string }
  | { type: 'addToProject'; font: ProjectFontRequest };

export interface WebviewOptions {
  /** A font file that is opened directly (custom editor), shown but not stored. */
  file?: vscode.Uri;
  /** Called once the webview has started and received its initial data. */
  onReady?: () => void;
}

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
  };
}

/**
 * Wires the font preview UI into a webview. Used by both the preview panel and
 * the custom editor for font files.
 */
export function attachFontPreview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  sources: FontSources,
  options: WebviewOptions = {},
): vscode.Disposable {
  webview.html = renderHtml(webview, extensionUri);
  const post = (message: unknown) => webview.postMessage(message);

  const addAndSend = async (ref: Omit<CustomFontRef, 'id'>) => {
    const loaded = await sources.load({ ...ref, id: 'pending' });
    if (loaded.error) {
      vscode.window.showErrorMessage(vscode.l10n.t('Font Preview: could not load {0}: {1}', ref.location, loaded.error));
      return;
    }
    const stored = await sources.addCustom(ref);
    post({ type: 'customAdded', font: { ...loaded, id: stored.id }, focus: true });
  };

  const sendTarget = () => post({ type: 'target', target: describeTarget() });
  const targetListener = onDidChangeTarget(sendTarget);

  const messageListener = webview.onDidReceiveMessage(async (message: FromWebview) => {
    switch (message.type) {
      case 'ready': {
        const custom = await Promise.all(sources.customFonts().map((ref) => sources.load(ref)));
        let opened: LoadedFont | undefined;
        if (options.file) {
          opened = await sources.load({
            id: 'opened-file',
            kind: 'file',
            label: labelFromLocation(options.file.fsPath),
            location: options.file.fsPath,
          });
        }
        post({
          type: 'init',
          sampleText: vscode.workspace.getConfiguration('fontPreview').get<string>('sampleText'),
          custom,
          opened,
          iconSets: ICON_SETS.map(({ source: _source, ...set }) => set),
          // Translations of the display language for the webview; empty for English.
          l10n: vscode.l10n.bundle ?? {},
          language: vscode.env.language,
          target: describeTarget(),
        });
        options.onReady?.();
        break;
      }
      case 'icons': {
        const set = ICON_SETS.find((s) => s.id === message.set);
        if (!set) {
          break;
        }
        try {
          post({ type: 'icons', set: set.id, icons: await sources.icons(set, message.force) });
        } catch (err) {
          post({ type: 'iconsError', set: set.id, message: (err as Error).message });
        }
        break;
      }
      case 'target':
        sendTarget();
        break;
      case 'addToProject':
        try {
          await addFontToProject(message.font);
        } catch (err) {
          vscode.window.showErrorMessage(vscode.l10n.t('Font Preview: could not add {0} to the project: {1}', message.font.label, (err as Error).message));
        }
        break;
      case 'fontsourceFaces':
        try {
          post({ type: 'response', id: message.id, result: await fontsourceFaces(message.fontId) });
        } catch (err) {
          post({ type: 'response', id: message.id, error: (err as Error).message });
        }
        break;
      case 'fontDetails':
        try {
          post({ type: 'response', id: message.id, result: await sources.details(message.source, message.fontId, message.family) });
        } catch (err) {
          post({ type: 'response', id: message.id, error: (err as Error).message });
        }
        break;
      case 'insert': {
        if (await insertText(message.text)) {
          vscode.window.setStatusBarMessage(vscode.l10n.t('Font Preview: {0} inserted', message.what), 3000);
        } else {
          await vscode.env.clipboard.writeText(message.text);
          vscode.window.showWarningMessage(vscode.l10n.t('Font Preview: no open text editor to insert into. The text was copied to the clipboard instead.'));
        }
        sendTarget();
        break;
      }
      case 'catalog':
        try {
          post({ type: 'catalog', fonts: await sources.catalog(message.force) });
        } catch (err) {
          post({ type: 'catalogError', message: (err as Error).message });
        }
        break;
      case 'addFile': {
        const files = await vscode.window.showOpenDialog({
          canSelectMany: true,
          openLabel: vscode.l10n.t('Add Font'),
          filters: { [vscode.l10n.t('Fonts')]: ['ttf', 'otf', 'woff', 'woff2', 'ttc'] },
        });
        for (const file of files ?? []) {
          await addAndSend({ kind: 'file', label: labelFromLocation(file.fsPath), location: file.fsPath });
        }
        break;
      }
      case 'addUrl': {
        let url: URL;
        try {
          url = new URL(message.url.trim());
        } catch {
          vscode.window.showErrorMessage(vscode.l10n.t('Font Preview: "{0}" is not a valid URL.', message.url));
          break;
        }
        const isCss = /\.css$/i.test(url.pathname) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'use.typekit.net';
        // Google Fonts links name the family in the URL; other stylesheets need it from the user.
        const googleFamily = url.searchParams.get('family')?.split(':')[0];
        await addAndSend({
          kind: isCss ? 'css' : 'url',
          label: message.label?.trim() || (isCss && googleFamily) || labelFromLocation(url.href),
          location: url.href,
        });
        break;
      }
      case 'addSystem':
        await addAndSend({ kind: 'system', label: message.family, location: message.family });
        break;
      case 'keep':
        await addAndSend({ kind: message.font.kind, label: message.font.label, location: message.font.location });
        break;
      case 'remove':
        await sources.removeCustom(message.id);
        break;
      case 'systemFonts':
        post({ type: 'systemFonts', families: await systemFamilies() });
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.setStatusBarMessage(vscode.l10n.t('Font Preview: {0} copied to clipboard', message.what), 3000);
        break;
    }
  });
  return vscode.Disposable.from(messageListener, targetListener);
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', file));
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline' https:`,
    `font-src ${webview.cspSource} https: data: blob:`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media('main.css')}">
<title>Font Preview</title>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${media('main.js')}"></script>
</body>
</html>`;
}
