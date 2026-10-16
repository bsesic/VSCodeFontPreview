import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { FontInfo, readFontInfo } from './fontInfo';
import { Icon, IconSetDef, loadIcons } from './iconSets';
import { fontsourceFontFile, googleFontFile, readRemoteFontInfo } from './fontDetails';

/** Entry of the Fontsource catalog (covers all Google Fonts plus some other open fonts). */
export interface CatalogFont {
  id: string;
  family: string;
  subsets: string[];
  weights: number[];
  styles: string[];
  defSubset: string;
  variable: boolean;
  category: string;
  type: string;
}

/** A user-added font that is remembered between sessions. */
export interface CustomFontRef {
  id: string;
  label: string;
  kind: 'file' | 'url' | 'css' | 'system';
  /** File path, font/CSS URL or system family name, depending on kind. */
  location: string;
}

/** Details of a catalog font and the font file they were read from. */
export interface RemoteFontInfo extends FontInfo {
  fileUrl: string;
  /** Only the default subset was read (other Fontsource fonts). */
  partial?: boolean;
}

/** What the webview receives for a custom font. */
export interface LoadedFont extends CustomFontRef {
  /** Base64 font data for file and url fonts. */
  data?: string;
  info?: FontInfo;
  error?: string;
}

const CATALOG_KEY = 'catalog.v1';
const CUSTOM_KEY = 'customFonts.v1';
const CATALOG_MAX_AGE = 24 * 60 * 60 * 1000;
const DETAILS_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export class FontSources {
  constructor(private readonly state: vscode.Memento) {}

  async catalog(force = false): Promise<CatalogFont[]> {
    const cached = this.state.get<{ time: number; fonts: CatalogFont[] }>(CATALOG_KEY);
    if (!force && cached && Date.now() - cached.time < CATALOG_MAX_AGE) {
      return cached.fonts;
    }
    const url = vscode.workspace.getConfiguration('fontPreview').get<string>('catalogUrl')!;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const raw = (await response.json()) as CatalogFont[];
      const fonts = raw.map(({ id, family, subsets, weights, styles, defSubset, variable, category, type }) => ({
        id, family, subsets, weights, styles, defSubset, variable, category, type,
      }));
      await this.state.update(CATALOG_KEY, { time: Date.now(), fonts });
      return fonts;
    } catch (err) {
      if (cached) {
        return cached.fonts;
      }
      throw new Error(`Could not load the font catalog from ${url}: ${(err as Error).message}`);
    }
  }

  /**
   * Names, coverage, axes and features of a catalog font, read from its complete font file
   * (Google Fonts) or from its default subset (other Fontsource fonts, marked as partial).
   */
  async details(source: 'google' | 'fontsource', id: string, family: string): Promise<RemoteFontInfo> {
    const key = `details.${source}.${id}`;
    const cached = this.state.get<{ time: number; info: RemoteFontInfo }>(key);
    if (cached && Date.now() - cached.time < DETAILS_MAX_AGE) {
      return cached.info;
    }
    const url = source === 'google' ? await googleFontFile(family) : await fontsourceFontFile(id);
    const info: RemoteFontInfo = { ...(await readRemoteFontInfo(url)), fileUrl: url };
    if (source === 'fontsource') {
      info.partial = true;
    }
    await this.state.update(key, { time: Date.now(), info });
    return info;
  }

  icons(set: IconSetDef, force = false): Promise<Icon[]> {
    return loadIcons(this.state, set, force);
  }

  customFonts(): CustomFontRef[] {
    return this.state.get<CustomFontRef[]>(CUSTOM_KEY, []);
  }

  async addCustom(ref: Omit<CustomFontRef, 'id'>): Promise<CustomFontRef> {
    const fonts = this.customFonts();
    const existing = fonts.find((f) => f.kind === ref.kind && f.location === ref.location);
    if (existing) {
      return existing;
    }
    const added = { ...ref, id: `${ref.kind}-${Date.now().toString(36)}` };
    await this.state.update(CUSTOM_KEY, [...fonts, added]);
    return added;
  }

  async removeCustom(id: string): Promise<void> {
    await this.state.update(CUSTOM_KEY, this.customFonts().filter((f) => f.id !== id));
  }

  /** Resolves the font data for a custom font so the webview can register it. */
  async load(ref: CustomFontRef): Promise<LoadedFont> {
    try {
      if (ref.kind === 'file') {
        return withData(ref, Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(ref.location))));
      }
      if (ref.kind === 'url') {
        const response = await fetch(ref.location);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return withData(ref, Buffer.from(await response.arrayBuffer()));
      }
      return { ...ref };
    } catch (err) {
      return { ...ref, error: (err as Error).message };
    }
  }
}

function withData(ref: CustomFontRef, buf: Buffer): LoadedFont {
  let info: FontInfo | undefined;
  try {
    info = readFontInfo(buf);
  } catch {
    // The browser may still be able to render fonts the reader does not understand.
  }
  return { ...ref, data: buf.toString('base64'), info };
}

export function labelFromLocation(location: string): string {
  const base = path.basename(location.split(/[?#]/)[0]);
  return base.replace(/\.(ttf|otf|woff2?|ttc|css)$/i, '') || location;
}

/** Lists installed font families via fontconfig (Linux, and macOS with fontconfig). */
export function systemFamilies(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('fc-list', ['--format', '%{family[0]}\\n'], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      const families = new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean));
      resolve([...families].sort((a, b) => a.localeCompare(b)));
    });
  });
}
