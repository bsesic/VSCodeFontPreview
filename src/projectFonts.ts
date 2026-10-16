import * as vscode from 'vscode';
import * as path from 'path';
import { FontFaceSource, fontsourceFaces } from './fontDetails';
import { FontInfo } from './fontInfo';
import { insertText, targetPath } from './editorTarget';

// "Add to project" downloads the font files into the workspace and writes a stylesheet
// with one @font-face rule per file, so a project does not depend on a font CDN.

/** What the webview sends to describe the font to add. */
export interface ProjectFontRequest {
  label: string;
  source: 'google' | 'fontsource' | 'file' | 'url';
  /** Fontsource id for catalog fonts, file path or URL otherwise. */
  location: string;
  category?: string;
  defSubset?: string;
  info?: FontInfo;
}

export interface ProjectFace {
  file: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  format: string;
}

export function slug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font';
}

const FORMATS: Record<string, string> = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };

export function fontFormat(file: string): string {
  const ext = path.extname(file.split(/[?#]/)[0]).slice(1).toLowerCase();
  return FORMATS[ext] ?? ext;
}

/** Stylesheet with one @font-face rule per downloaded file. */
export function fontFaceCss(family: string, faces: ProjectFace[], comment?: string): string {
  const quoted = `"${family.replace(/["\\]/g, '\\$&')}"`;
  const rules = faces.map((face) =>
    [
      '@font-face {',
      `  font-family: ${quoted};`,
      `  font-style: ${face.style};`,
      `  font-weight: ${face.weight};`,
      '  font-display: swap;',
      `  src: url("./${face.file}") format("${face.format}");`,
      ...(face.unicodeRange ? [`  unicode-range: ${face.unicodeRange};`] : []),
      '}',
    ].join('\n'),
  );
  return `${comment ? `/* ${comment} */\n\n` : ''}${rules.join('\n\n')}\n`;
}

/** `@import` for the stylesheet, relative to the document that receives it. */
export function importRule(stylesheet: string, fromDocument?: string): string {
  let href = stylesheet;
  if (fromDocument) {
    href = path.relative(path.dirname(fromDocument), stylesheet).split(path.sep).join('/');
    if (!href.startsWith('.')) {
      href = `./${href}`;
    }
  }
  return `@import url("${href}");`;
}

/** Variant label such as "700 italic" for the weight/style picker. */
function variantLabel(face: FontFaceSource): string {
  return `${face.weight} ${face.style}`;
}

/** Numbered subsets ("0", "1", …) split CJK fonts into many small files. */
function isNumbered(subset: string): boolean {
  return /^\d+$/.test(subset);
}

async function pickCatalogFaces(font: ProjectFontRequest): Promise<FontFaceSource[] | undefined> {
  const faces = await fontsourceFaces(font.location);
  const variants = [...new Set(faces.map(variantLabel))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
  const pickedVariants = await vscode.window.showQuickPick(
    variants.map((label) => ({ label, picked: label === '400 normal' || label === '700 normal' })),
    { canPickMany: true, title: vscode.l10n.t('Add {0} to the project (1/2)', font.label), placeHolder: vscode.l10n.t('Weights and styles') },
  );
  if (!pickedVariants?.length) {
    return undefined;
  }

  const named = [...new Set(faces.map((f) => f.subset).filter((s) => !isNumbered(s)))].sort();
  const numbered = new Set(faces.map((f) => f.subset).filter(isNumbered));
  const CJK = 'cjk';
  const subsetItems = named.map((label) => ({ label, picked: label === 'latin' || label === 'latin-ext' || label === font.defSubset }));
  if (numbered.size) {
    subsetItems.push({ label: CJK, picked: true, description: vscode.l10n.t('{0} files per style, the browser loads only what a page needs', numbered.size) } as typeof subsetItems[number]);
  }
  const pickedSubsets = await vscode.window.showQuickPick(subsetItems, {
    canPickMany: true,
    title: vscode.l10n.t('Add {0} to the project (2/2)', font.label),
    placeHolder: vscode.l10n.t('Scripts (subsets)'),
  });
  if (!pickedSubsets?.length) {
    return undefined;
  }
  const variantSet = new Set(pickedVariants.map((v) => v.label));
  const subsetSet = new Set(pickedSubsets.map((s) => s.label));
  return faces.filter((f) => variantSet.has(variantLabel(f)) && (subsetSet.has(f.subset) || (isNumbered(f.subset) && subsetSet.has(CJK))));
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} (${url})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Runs `task` for every item with at most `limit` running at a time. */
async function inBatches<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(task))));
  }
  return results;
}

/**
 * Downloads or copies the font into `<workspace>/<fontPreview.projectFontFolder>/<font>/`,
 * writes `<font>.css` and offers to insert an `@import` of it.
 */
export async function addFontToProject(font: ProjectFontRequest): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const workspace =
    folders.length > 1
      ? (await vscode.window.showWorkspaceFolderPick({ placeHolder: vscode.l10n.t('Workspace folder for {0}', font.label) }))
      : folders[0];
  if (!workspace) {
    if (!folders.length) {
      vscode.window.showErrorMessage(vscode.l10n.t('Font Preview: open a folder to add fonts to a project.'));
    }
    return;
  }
  const base = vscode.workspace.getConfiguration('fontPreview').get<string>('projectFontFolder') || 'fonts';
  const name = slug(font.label);
  const dir = vscode.Uri.joinPath(workspace.uri, base, name);

  let files: Array<{ name: string; data: () => Thenable<Uint8Array>; face: ProjectFace }>;
  let comment: string;
  if (font.source === 'google' || font.source === 'fontsource') {
    const faces = await pickCatalogFaces(font);
    if (!faces) {
      return;
    }
    files = faces.map((f) => {
      const file = `${name}-${f.subset}-${f.weight}-${f.style}.woff2`;
      return { name: file, data: () => download(f.url), face: { file, weight: String(f.weight), style: f.style, unicodeRange: f.unicodeRange, format: 'woff2' } };
    });
    // The stylesheet comment stays English like the rest of the generated code.
    comment = `${font.label} from ${font.source === 'google' ? 'Google Fonts' : 'Fontsource'} (files: Fontsource). Check the font license before you publish it.`;
  } else {
    const ext = path.extname(font.location.split(/[?#]/)[0]) || '.woff2';
    const file = `${name}${ext.toLowerCase()}`;
    const wght = font.info?.axes.find((a) => a.tag === 'wght');
    const data =
      font.source === 'file'
        ? () => vscode.workspace.fs.readFile(vscode.Uri.file(font.location))
        : () => download(font.location);
    files = [{ name: file, data, face: { file, weight: wght ? `${wght.min} ${wght.max}` : 'normal', style: 'normal', format: fontFormat(file) } }];
    comment = `${font.label}${font.info?.license ? `. License: ${font.info.license.split('\n')[0]}` : ''}`;
  }

  const stylesheet = vscode.Uri.joinPath(dir, `${name}.css`);
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Adding {0} to the project', font.label) },
    async (progress) => {
      await vscode.workspace.fs.createDirectory(dir);
      let done = 0;
      await inBatches(files, 6, async (f) => {
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, f.name), await f.data());
        progress.report({ increment: 100 / files.length, message: `${++done} / ${files.length}` });
      });
      await vscode.workspace.fs.writeFile(stylesheet, Buffer.from(fontFaceCss(font.label, files.map((f) => f.face), comment)));
    },
  );

  const relative = path.posix.join(base, name, `${name}.css`);
  const insertImport = vscode.l10n.t('Insert @import');
  const openStylesheet = vscode.l10n.t('Open Stylesheet');
  const choice = await vscode.window.showInformationMessage(
    files.length === 1
      ? vscode.l10n.t('Font Preview: added 1 file and {0}.', relative)
      : vscode.l10n.t('Font Preview: added {0} files and {1}.', files.length, relative),
    insertImport,
    openStylesheet,
  );
  if (choice === insertImport) {
    if (!(await insertText(importRule(stylesheet.fsPath, targetPath())))) {
      vscode.window.showWarningMessage(vscode.l10n.t('Font Preview: no open text editor to insert into.'));
    }
  } else if (choice === openStylesheet) {
    await vscode.window.showTextDocument(stylesheet);
  }
}
