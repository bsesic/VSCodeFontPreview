import * as vscode from 'vscode';

/** One renderable variant of an icon set, e.g. Font Awesome "solid". */
export interface IconStyle {
  id: string;
  label: string;
  /** CSS font-family the stylesheet defines. */
  family: string;
  weight: number;
  /** HTML snippet; `{name}` is replaced by the icon name. */
  html: string;
}

export interface IconSetDef {
  id: string;
  label: string;
  version: string;
  license: string;
  homepage: string;
  /** Stylesheets that define the font faces (loaded by the webview and exported). */
  css: string[];
  styles: IconStyle[];
  /** Where the icon names come from. */
  source:
    | { kind: 'css'; url: string; prefix: string }
    | { kind: 'fontawesome'; url: string }
    | { kind: 'codepoints'; url: string };
}

export interface Icon {
  name: string;
  code: number;
  /** Style ids the icon exists in; all styles when omitted. */
  styles?: string[];
  terms?: string[];
}

const NPM = 'https://cdn.jsdelivr.net/npm';
const MATERIAL_CODEPOINTS =
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';

export const ICON_SETS: IconSetDef[] = [
  {
    id: 'fontawesome',
    label: 'Font Awesome Free',
    version: '7.3.1',
    license: 'Icons CC BY 4.0, Fonts SIL OFL 1.1',
    homepage: 'https://fontawesome.com',
    css: [`${NPM}/@fortawesome/fontawesome-free@7.3.1/css/all.min.css`],
    styles: [
      { id: 'solid', label: 'Solid', family: 'Font Awesome 7 Free', weight: 900, html: '<i class="fa-solid fa-{name}"></i>' },
      { id: 'regular', label: 'Regular', family: 'Font Awesome 7 Free', weight: 400, html: '<i class="fa-regular fa-{name}"></i>' },
      { id: 'brands', label: 'Brands', family: 'Font Awesome 7 Brands', weight: 400, html: '<i class="fa-brands fa-{name}"></i>' },
    ],
    source: { kind: 'fontawesome', url: `${NPM}/@fortawesome/fontawesome-free@7.3.1/metadata/icon-families.json` },
  },
  {
    id: 'bootstrap',
    label: 'Bootstrap Icons',
    version: '1.13.2',
    license: 'MIT',
    homepage: 'https://icons.getbootstrap.com',
    css: [`${NPM}/bootstrap-icons@1.13.2/font/bootstrap-icons.min.css`],
    styles: [{ id: 'regular', label: 'Regular', family: 'bootstrap-icons', weight: 400, html: '<i class="bi bi-{name}"></i>' }],
    source: { kind: 'css', url: `${NPM}/bootstrap-icons@1.13.2/font/bootstrap-icons.min.css`, prefix: 'bi-' },
  },
  {
    id: 'material',
    label: 'Material Symbols',
    version: 'latest',
    license: 'Apache 2.0',
    homepage: 'https://fonts.google.com/icons',
    css: [
      'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined',
      'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded',
      'https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp',
    ],
    styles: [
      { id: 'outlined', label: 'Outlined', family: 'Material Symbols Outlined', weight: 400, html: '<span class="material-symbols-outlined">{name}</span>' },
      { id: 'rounded', label: 'Rounded', family: 'Material Symbols Rounded', weight: 400, html: '<span class="material-symbols-rounded">{name}</span>' },
      { id: 'sharp', label: 'Sharp', family: 'Material Symbols Sharp', weight: 400, html: '<span class="material-symbols-sharp">{name}</span>' },
    ],
    source: { kind: 'codepoints', url: MATERIAL_CODEPOINTS },
  },
  {
    id: 'remix',
    label: 'Remix Icon',
    version: '4.9.1',
    license: 'Remix Icon License 1.0',
    homepage: 'https://remixicon.com',
    css: [`${NPM}/remixicon@4.9.1/fonts/remixicon.css`],
    styles: [{ id: 'regular', label: 'Regular', family: 'remixicon', weight: 400, html: '<i class="ri-{name}"></i>' }],
    source: { kind: 'css', url: `${NPM}/remixicon@4.9.1/fonts/remixicon.css`, prefix: 'ri-' },
  },
  {
    id: 'lucide',
    label: 'Lucide',
    version: '1.58.0',
    license: 'ISC',
    homepage: 'https://lucide.dev',
    css: [`${NPM}/lucide-static@1.58.0/font/lucide.css`],
    styles: [{ id: 'regular', label: 'Regular', family: 'lucide', weight: 400, html: '<i class="icon-{name}"></i>' }],
    source: { kind: 'css', url: `${NPM}/lucide-static@1.58.0/font/lucide.css`, prefix: 'icon-' },
  },
  {
    id: 'tabler',
    label: 'Tabler Icons',
    version: '3.49.0',
    license: 'MIT',
    homepage: 'https://tabler.io/icons',
    css: [`${NPM}/@tabler/icons-webfont@3.49.0/dist/tabler-icons.min.css`],
    styles: [{ id: 'regular', label: 'Outline', family: 'tabler-icons', weight: 400, html: '<i class="ti ti-{name}"></i>' }],
    source: { kind: 'css', url: `${NPM}/@tabler/icons-webfont@3.49.0/dist/tabler-icons.min.css`, prefix: 'ti-' },
  },
  {
    id: 'phosphor',
    label: 'Phosphor',
    version: '2.1.2',
    license: 'MIT',
    homepage: 'https://phosphoricons.com',
    css: [`${NPM}/@phosphor-icons/web@2.1.2/src/regular/style.css`],
    styles: [{ id: 'regular', label: 'Regular', family: 'Phosphor', weight: 400, html: '<i class="ph ph-{name}"></i>' }],
    source: { kind: 'css', url: `${NPM}/@phosphor-icons/web@2.1.2/src/regular/style.css`, prefix: 'ph-' },
  },
];

/** Extracts `.prefix-name::before { content: "\f101" }` rules from an icon stylesheet. */
export function parseIconCss(css: string, prefix: string): Icon[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`\\.${escaped}([\\w-]+?)::?before\\s*\\{[^}]*?content:\\s*["']\\\\([0-9a-fA-F]+)["']`, 'g');
  const icons = new Map<string, Icon>();
  for (const match of css.matchAll(rule)) {
    icons.set(match[1], { name: match[1], code: parseInt(match[2], 16) });
  }
  return [...icons.values()];
}

interface FontAwesomeEntry {
  unicode: string;
  label?: string;
  search?: { terms?: string[] };
  familyStylesByLicense?: { free?: Array<{ family: string; style: string }> };
}

/** Reads Font Awesome's icon-families.json, keeping only icons that are part of Free. */
export function parseFontAwesome(json: Record<string, FontAwesomeEntry>): Icon[] {
  const icons: Icon[] = [];
  for (const [name, entry] of Object.entries(json)) {
    const styles = (entry.familyStylesByLicense?.free ?? []).filter((s) => s.family === 'classic' || s.style === 'brands').map((s) => s.style);
    if (!styles.length) {
      continue;
    }
    const terms = [...(entry.search?.terms ?? []), ...(entry.label ? [entry.label.toLowerCase()] : [])];
    icons.push({ name, code: parseInt(entry.unicode, 16), styles: [...new Set(styles)], terms });
  }
  return icons;
}

/** Reads a `name hex` per line codepoints file (Material Symbols). */
export function parseCodepoints(text: string): Icon[] {
  const icons: Icon[] = [];
  for (const line of text.split('\n')) {
    const [name, hex] = line.trim().split(/\s+/);
    if (name && hex) {
      icons.push({ name, code: parseInt(hex, 16) });
    }
  }
  return icons;
}

const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export async function loadIcons(state: vscode.Memento, set: IconSetDef, force = false): Promise<Icon[]> {
  const key = `icons.${set.id}.${set.version}`;
  const cached = state.get<{ time: number; icons: Icon[] }>(key);
  // Pinned versions never change; "latest" sets are refreshed weekly.
  if (!force && cached && (set.version !== 'latest' || Date.now() - cached.time < MAX_AGE)) {
    return cached.icons;
  }
  try {
    const response = await fetch(set.source.url);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    let icons: Icon[];
    if (set.source.kind === 'fontawesome') {
      icons = parseFontAwesome((await response.json()) as Record<string, FontAwesomeEntry>);
    } else if (set.source.kind === 'codepoints') {
      icons = parseCodepoints(await response.text());
    } else {
      icons = parseIconCss(await response.text(), set.source.prefix);
    }
    if (!icons.length) {
      throw new Error('no icons found');
    }
    icons.sort((a, b) => a.name.localeCompare(b.name));
    await state.update(key, { time: Date.now(), icons });
    return icons;
  } catch (err) {
    if (cached) {
      return cached.icons;
    }
    throw new Error(`Could not load ${set.label}: ${(err as Error).message}`);
  }
}
