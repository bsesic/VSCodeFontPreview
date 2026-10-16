// @ts-check
/* Font Preview webview. Plain DOM, no framework. */
(function () {
  // @ts-expect-error acquireVsCodeApi is injected by VS Code
  const vscode = acquireVsCodeApi();

  const GOOGLE_CSS = 'https://fonts.googleapis.com/css2';
  const FONTSOURCE_CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
  const PAGE_SIZE = 60;
  const GLYPH_LIMIT = 3000;

  const FALLBACKS = {
    'sans-serif': 'sans-serif',
    serif: 'serif',
    monospace: 'monospace',
    display: 'sans-serif',
    handwriting: 'cursive',
    icons: 'sans-serif',
    other: 'sans-serif',
  };

  /** Unicode blocks offered in the glyph view. */
  const BLOCKS = [
    ['Basic Latin', 0x0020, 0x007f, 'latin'],
    ['Latin-1 Supplement', 0x00a0, 0x00ff, 'latin'],
    ['Latin Extended-A', 0x0100, 0x017f, 'latin-ext'],
    ['Latin Extended-B', 0x0180, 0x024f, 'latin-ext'],
    ['IPA Extensions', 0x0250, 0x02af],
    ['Spacing Modifier Letters', 0x02b0, 0x02ff],
    ['Combining Diacritical Marks', 0x0300, 0x036f],
    ['Greek and Coptic', 0x0370, 0x03ff, 'greek'],
    ['Cyrillic', 0x0400, 0x04ff, 'cyrillic'],
    ['Cyrillic Supplement', 0x0500, 0x052f, 'cyrillic-ext'],
    ['Armenian', 0x0530, 0x058f, 'armenian'],
    ['Hebrew', 0x0590, 0x05ff, 'hebrew'],
    ['Arabic', 0x0600, 0x06ff, 'arabic'],
    ['Syriac', 0x0700, 0x074f, 'syriac'],
    ['Devanagari', 0x0900, 0x097f, 'devanagari'],
    ['Bengali', 0x0980, 0x09ff, 'bengali'],
    ['Tamil', 0x0b80, 0x0bff, 'tamil'],
    ['Thai', 0x0e00, 0x0e7f, 'thai'],
    ['Georgian', 0x10a0, 0x10ff, 'georgian'],
    ['Ethiopic', 0x1200, 0x137f, 'ethiopic'],
    ['Latin Extended Additional', 0x1e00, 0x1eff, 'vietnamese'],
    ['Greek Extended', 0x1f00, 0x1fff, 'greek-ext'],
    ['General Punctuation', 0x2000, 0x206f],
    ['Superscripts and Subscripts', 0x2070, 0x209f],
    ['Currency Symbols', 0x20a0, 0x20cf],
    ['Letterlike Symbols', 0x2100, 0x214f],
    ['Number Forms', 0x2150, 0x218f],
    ['Arrows', 0x2190, 0x21ff],
    ['Mathematical Operators', 0x2200, 0x22ff, 'math'],
    ['Miscellaneous Technical', 0x2300, 0x23ff],
    ['Box Drawing', 0x2500, 0x257f],
    ['Block Elements', 0x2580, 0x259f],
    ['Geometric Shapes', 0x25a0, 0x25ff],
    ['Miscellaneous Symbols', 0x2600, 0x26ff, 'symbols'],
    ['Dingbats', 0x2700, 0x27bf],
    ['CJK Symbols and Punctuation', 0x3000, 0x303f],
    ['Hiragana', 0x3040, 0x309f, 'japanese'],
    ['Katakana', 0x30a0, 0x30ff],
    ['CJK Unified Ideographs', 0x4e00, 0x9fff, 'chinese-simplified'],
    ['Hangul Syllables', 0xac00, 0xd7af, 'korean'],
    ['Private Use Area', 0xe000, 0xf8ff],
    ['Alphabetic Presentation Forms', 0xfb00, 0xfb4f],
    ['Specials', 0xfff0, 0xffff],
  ];

  const saved = vscode.getState() || {};
  const state = {
    tab: 'fonts',
    source: 'google',
    query: '',
    category: '',
    subset: '',
    includeOther: false,
    collection: /** @type {string[]} */ ([]),
    roles: { heading: '', body: '', mono: '' },
    inspect: '',
    block: '',
    sample: '',
    preview: { size: 32, weight: 400, lineHeight: 1.4, align: 'start' },
    iconSet: 'fontawesome',
    iconStyle: '',
    iconQuery: '',
    iconSize: 28,
    iconSelected: '',
    features: /** @type {Record<string, Record<string, boolean>>} */ ({}),
    insertFormat: 'auto',
    compareSize: 32,
    compareWeight: 400,
    typo: { headingWeight: 600, bodyWeight: 400, size: 16, lineHeight: 1.5, letterSpacing: 0, theme: 'light' },
    ...saved,
  };
  const save = () => vscode.setState(state);

  /**
   * @typedef {{ key: string, label: string, family: string, source: string, category: string,
   *   weights: number[], styles: string[], subsets: string[], variable: boolean,
   *   id?: string, defSubset?: string, ref?: any, info?: any, data?: string,
   *   status?: 'loading'|'ok'|'error', error?: string, loaded?: Promise<void>, previewed?: boolean }} Font
   */
  /** @type {Map<string, Font>} */
  const fonts = new Map();
  /** @type {any[] | null} */
  let catalog = null;
  let catalogError = '';
  let catalogRequested = false;
  /** @type {string[] | null} */
  let systemFamilies = null;
  let visibleCount = PAGE_SIZE;
  /** @type {any[]} */
  let iconSets = [];
  /** @type {Map<string, any[] | { error: string } | 'loading'>} */
  const iconData = new Map();
  let iconVisible = 0;
  /** @type {{ name: string, languageId: string } | undefined} */
  let target;
  let defaultSample = '';
  /** Family requested by "Preview Font Under Cursor", until it is found or added. */
  let pendingFamily = '';
  let openedKey = '';

  // ---------------------------------------------------------------- helpers

  /**
   * Creates an element. Children may be strings, nodes or falsy values.
   * @param {string} tag
   * @param {Record<string, any>} [props]
   * @param {...any} children
   * @returns {HTMLElement}
   */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'style' && typeof v === 'object') {
        for (const [prop, value] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, value);
          else /** @type {any} */ (el.style)[prop] = value;
        }
      }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k in el && typeof v !== 'string') /** @type {any} */ (el)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : String(child));
    }
    return el;
  }

  function quote(family) {
    return `"${family.replace(/["\\]/g, '\\$&')}"`;
  }

  /** CSS font-family stack for a font key (or a generic fallback). */
  function stack(key, generic = 'sans-serif') {
    const font = fonts.get(key);
    if (!font) return generic;
    return `${quote(font.family)}, ${FALLBACKS[font.category] || generic}`;
  }

  function hex(cp) {
    return cp.toString(16).toUpperCase().padStart(4, '0');
  }

  /** Combining marks are shown on a dotted circle so they have something to attach to. */
  function glyphText(cp) {
    const ch = String.fromCodePoint(cp);
    return /\p{M}/u.test(ch) ? `\u25CC${ch}` : ch;
  }

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function sampleText() {
    return state.sample || defaultSample || 'The quick brown fox jumps over the lazy dog.';
  }

  /** First non-empty line, for one-line previews. */
  function sampleLine() {
    return sampleText().split('\n').find((l) => l.trim()) || sampleText();
  }

  const SAMPLE_PRESETS = [
    ['pangram', 'Pangram', () => defaultSample || 'The quick brown fox jumps over the lazy dog.'],
    ['alphabet', 'Alphabet & numbers', () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 ½ ¼ ¾ € $ £ ¥ % ‰'],
    ['punctuation', 'Punctuation', () => '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~\n„Deutsch“ “English” «français» ‚single‘ – — … · • © ® ™ § ¶'],
    ['paragraph', 'Paragraph', () => 'Typography is the craft of endowing human language with a durable visual form.\n\nGood body text is easy to read at length: a comfortable size, generous line height and a measure of 60–75 characters. Watch how the ascenders and descenders of the lines interact, and whether the rhythm of the paragraph stays even.'],
    ['diacritics', 'Diacritics', () => 'ÀÁÂÃÄÅ ÇÈÉÊË ÌÍÎÏ ÑÒÓÔÕÖ ÙÚÛÜ Ý ß\nàáâãäå çèéêë ìíîï ñòóôõö ùúûü ý ÿ\nĀ ā Ă ă Ą ą Ć ć Č č Ď ď Ę ę Ě ě Ł ł Ń ń Ő ő Ř ř Ś ś Š š Ť ť Ů ů Ű ű Ź ź Ž ž'],
    ['hebrew', 'Hebrew', () => 'אבגדהוזחטיכךלמםנןסעפףצץקרשת\nבְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ'],
    ['greek', 'Greek & Cyrillic', () => 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ αβγδεζηθικλμνξοπρστυφχψω\nАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ абвгдежзийклмнопрстуфхцчшщъыьэюя'],
    ['opentype', 'OpenType test', () => 'Office affluent fjord, The flight of the waffle. ffi ffl fft Th st ct\nFIGURES 0123456789 · figures 0123456789 · 1/2 3/4 5/8 · 1st 2nd 3rd 4th · H2O E=mc2\nSmall Caps & Capitals: The Quick Brown Fox · 10:45 · (Parentheses) [BRACKETS] {BRACES}'],
    ['code', 'Code', () => 'const greet = (name) => `Hello, ${name}!`;\nif (a != b && c <= d || e >= f) { return [0, O, 1, l, I]; }\n// -> => == === != !== <= >= ::'],
  ];

  /**
   * ASCII and its 8-bit extensions. Each code page fills bytes 0x80–0xFF with the
   * letters of a different group of languages.
   */
  const CODE_PAGES = [
    ['iso-8859-1', 'ISO-8859-1 · Latin-1, Western European', 'windows-1252', 0xa0],
    ['iso-8859-2', 'ISO-8859-2 · Latin-2, Central European', 'iso-8859-2'],
    ['iso-8859-3', 'ISO-8859-3 · Latin-3, Maltese, Esperanto', 'iso-8859-3'],
    ['iso-8859-4', 'ISO-8859-4 · Latin-4, Baltic', 'iso-8859-4'],
    ['iso-8859-5', 'ISO-8859-5 · Cyrillic', 'iso-8859-5'],
    ['iso-8859-6', 'ISO-8859-6 · Arabic', 'iso-8859-6'],
    ['iso-8859-7', 'ISO-8859-7 · Greek', 'iso-8859-7'],
    ['iso-8859-8', 'ISO-8859-8 · Hebrew', 'iso-8859-8'],
    ['iso-8859-9', 'ISO-8859-9 · Latin-5, Turkish', 'windows-1254', 0xa0],
    ['iso-8859-10', 'ISO-8859-10 · Latin-6, Nordic', 'iso-8859-10'],
    ['iso-8859-11', 'ISO-8859-11 · Thai', 'windows-874', 0xa0],
    ['iso-8859-13', 'ISO-8859-13 · Latin-7, Baltic Rim', 'iso-8859-13'],
    ['iso-8859-14', 'ISO-8859-14 · Latin-8, Celtic', 'iso-8859-14'],
    ['iso-8859-15', 'ISO-8859-15 · Latin-9, Western European with €', 'iso-8859-15'],
    ['iso-8859-16', 'ISO-8859-16 · Latin-10, South-Eastern European', 'iso-8859-16'],
    ['windows-1250', 'Windows-1250 · Central European', 'windows-1250'],
    ['windows-1251', 'Windows-1251 · Cyrillic', 'windows-1251'],
    ['windows-1252', 'Windows-1252 · Western European', 'windows-1252'],
    ['windows-1253', 'Windows-1253 · Greek', 'windows-1253'],
    ['windows-1254', 'Windows-1254 · Turkish', 'windows-1254'],
    ['windows-1255', 'Windows-1255 · Hebrew', 'windows-1255'],
    ['windows-1256', 'Windows-1256 · Arabic', 'windows-1256'],
    ['windows-1257', 'Windows-1257 · Baltic', 'windows-1257'],
    ['windows-1258', 'Windows-1258 · Vietnamese', 'windows-1258'],
    ['koi8-r', 'KOI8-R · Russian', 'koi8-r'],
    ['koi8-u', 'KOI8-U · Ukrainian', 'koi8-u'],
    ['cp437', 'CP437 · DOS, box drawing', null],
    ['cp866', 'CP866 · DOS Cyrillic', 'ibm866'],
    ['macintosh', 'Mac OS Roman', 'macintosh'],
    ['x-mac-cyrillic', 'Mac OS Cyrillic', 'x-mac-cyrillic'],
  ];

  // The browser has no decoder for the original IBM PC code page, so its upper half is listed here.
  const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0';

  /** One table row per 16 bytes; control characters and unassigned bytes are left out. */
  function byteRows(from, to, charAt) {
    const rows = [];
    for (let row = from; row <= to; row += 16) {
      const chars = [];
      for (let byte = row; byte < row + 16 && byte <= to; byte++) {
        const ch = charAt(byte);
        if (ch && ch !== '\ufffd' && !/[\p{Cc}\u00a0\u00ad]/u.test(ch)) chars.push(ch);
      }
      if (chars.length) rows.push(chars.join(' '));
    }
    return rows.join('\n');
  }

  function asciiTable() {
    return byteRows(0x20, 0x7f, (b) => String.fromCharCode(b));
  }

  function codePageTable(id) {
    const page = CODE_PAGES.find(([pid]) => pid === id);
    if (!page) return '';
    const [, , encoding, from = 0x80] = page;
    let charAt;
    if (encoding) {
      const decoder = new TextDecoder(encoding);
      charAt = (b) => decoder.decode(Uint8Array.of(b));
    } else {
      charAt = (b) => CP437_HIGH[b - 0x80];
    }
    return byteRows(from, 0xff, charAt);
  }

  /** First sentence of the sample (a letter, then . ! ? and a space), cut at a word boundary after 60 characters. */
  function headingText() {
    const line = sampleLine().trim();
    const sentence = line.split(/(?<=\p{L}[.!?])\s/u)[0] || line;
    if (sentence.length <= 60) return sentence || 'Heading';
    const cut = sentence.slice(0, 60);
    const space = cut.lastIndexOf(' ');
    return `${(space > 30 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, '')}…`;
  }

  /** Sample text editor; `multiline` gives a resizable textarea. */
  function sampleBox(multiline) {
    const field = multiline
      ? h('textarea', { class: 'sample-area', rows: 4, spellcheck: false, placeholder: 'Type or paste sample text… (Enter for a new line)', 'aria-label': 'Sample text' })
      : h('input', { class: 'sample-line', type: 'text', placeholder: 'Sample text…', 'aria-label': 'Sample text' });
    field.value = multiline ? sampleText() : sampleLine();
    field.addEventListener('input', () => {
      state.sample = field.value;
      save();
      scheduleSampleUpdate();
    });
    return h('div', { class: `sample-box ${multiline ? 'multiline' : ''}` },
      field,
      h('select', {
        'aria-label': 'Sample text presets',
        onchange: (e) => {
          const value = e.target.value;
          const preset = SAMPLE_PRESETS.find(([id]) => id === value);
          let text = '';
          if (preset) text = preset[2]();
          else if (value === 'ascii') text = asciiTable();
          else if (value === 'ascii-all') {
            text = [`ASCII\n${asciiTable()}`, ...CODE_PAGES.map(([id, label]) => `${label}\n${codePageTable(id)}`)].join('\n\n');
          }
          else if (value.startsWith('cp:')) {
            // Code pages only differ above 0x7F, so ASCII comes first.
            text = `${asciiTable()}\n${codePageTable(value.slice(3))}`;
          }
          if (text) {
            state.sample = text;
            save();
            render();
          }
        },
      },
        h('option', { value: '' }, 'Presets…'),
        h('optgroup', { label: 'Text' }, SAMPLE_PRESETS.map(([id, label]) => h('option', { value: id }, label))),
        h('optgroup', { label: 'Character tables' },
          h('option', { value: 'ascii' }, 'ASCII (US-ASCII, 0x20–0x7E)'),
          CODE_PAGES.map(([id, label]) => h('option', { value: `cp:${id}` }, label)),
          h('option', { value: 'ascii-all' }, 'All code pages at once'),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- font registry

  function registerCatalog(list) {
    catalog = list;
    for (const f of list) {
      const key = `${f.type === 'google' ? 'google' : 'fontsource'}:${f.id}`;
      if (fonts.has(key)) continue;
      fonts.set(key, {
        key,
        id: f.id,
        label: f.family,
        family: f.family,
        source: f.type === 'google' ? 'google' : 'fontsource',
        category: f.category,
        weights: f.weights,
        styles: f.styles,
        subsets: f.subsets,
        defSubset: f.defSubset,
        variable: f.variable,
      });
    }
  }

  /** Adds a font coming from the extension (file, URL, CSS or system). */
  function registerCustom(loaded) {
    const key = loaded.id === 'opened-file' ? 'opened-file' : `custom:${loaded.id}`;
    const info = loaded.info;
    const axes = info?.axes || [];
    const wght = axes.find((a) => a.tag === 'wght');
    const font = {
      key,
      label: loaded.label,
      // Local and downloaded font data is registered under a private name so it
      // never shadows an installed font of the same family.
      family: loaded.kind === 'file' || loaded.kind === 'url' ? `FP ${loaded.label} ${loaded.id}` : loaded.label,
      source: loaded.kind,
      category: 'other',
      weights: wght ? [wght.min, wght.max] : [400],
      styles: ['normal'],
      subsets: [],
      variable: axes.length > 0,
      ref: { id: loaded.id, kind: loaded.kind, label: loaded.label, location: loaded.location },
      info,
      data: loaded.data,
      status: loaded.error ? 'error' : undefined,
      error: loaded.error,
    };
    fonts.set(key, font);
    return font;
  }

  function addStylesheet(href) {
    if (document.querySelector(`link[data-href="${CSS.escape(href)}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = h('link', { rel: 'stylesheet', href, 'data-href': href });
      link.addEventListener('load', () => resolve(undefined));
      link.addEventListener('error', () => reject(new Error(`Stylesheet could not be loaded: ${href}`)));
      document.head.append(link);
    });
  }

  /** Google's axis order: lowercase tags alphabetically, then uppercase tags alphabetically. */
  function sortAxes(axes) {
    const lower = (t) => t === t.toLowerCase();
    return [...axes].sort((a, b) => (lower(a.tag) === lower(b.tag) ? (a.tag < b.tag ? -1 : 1) : lower(a.tag) ? -1 : 1));
  }

  function googleCssUrl(font, text, allAxes = false) {
    const italic = font.styles.includes('italic');
    let spec;
    const axes = allAxes ? sortAxes((font.info?.axes || []).filter((a) => a.tag !== 'ital')) : [];
    if (axes.length) {
      const tags = axes.map((a) => a.tag).join(',');
      const values = axes.map((a) => `${a.min}..${a.max}`).join(',');
      spec = italic ? `ital,${tags}@0,${values};1,${values}` : `${tags}@${values}`;
    } else if (font.variable && font.weights.length > 1) {
      const range = `${Math.min(...font.weights)}..${Math.max(...font.weights)}`;
      spec = italic ? `ital,wght@0,${range};1,${range}` : `wght@${range}`;
    } else if (italic) {
      spec = `ital,wght@${[...font.weights.map((w) => `0,${w}`), ...font.weights.map((w) => `1,${w}`)].join(';')}`;
    } else {
      spec = `wght@${font.weights.join(';')}`;
    }
    const family = `${font.family.replace(/ /g, '+')}:${spec}`;
    return `${GOOGLE_CSS}?family=${family}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ''}`;
  }

  /** Loads only the characters of the family name, for cheap list previews. */
  function loadPreview(font) {
    if (font.previewed || font.loaded) return;
    font.previewed = true;
    if (font.source === 'google') {
      addStylesheet(googleCssUrl({ ...font, weights: [font.weights.includes(400) ? 400 : font.weights[0]], variable: false, styles: ['normal'] }, font.label + sampleText())).catch(() => undefined);
    } else if (font.source === 'fontsource') {
      const weight = font.weights.includes(400) ? 400 : font.weights[0];
      const face = new FontFace(font.family, `url(${FONTSOURCE_CDN}/${font.id}@latest/${font.defSubset}-${weight}-normal.woff2)`, { weight: String(weight) });
      document.fonts.add(face);
      face.load().catch(() => undefined);
    } else {
      ensureLoaded(font);
    }
  }

  /** Loads the full font and records whether it works. */
  function ensureLoaded(font) {
    if (font.loaded) return font.loaded;
    font.status = 'loading';
    font.loaded = (async () => {
      if (font.source === 'google') {
        await addStylesheet(googleCssUrl(font));
      } else if (font.source === 'fontsource') {
        // Every subset gets its unicode-range; the browser downloads a subset only when text needs it.
        const faces = await request('fontsourceFaces', { fontId: font.id });
        const loads = [];
        for (const f of faces) {
          const face = new FontFace(font.family, `url(${f.url})`, { weight: String(f.weight), style: f.style, ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}) });
          document.fonts.add(face);
          if (f.subset === font.defSubset) loads.push(face.load());
        }
        await Promise.all(loads);
      } else if (font.source === 'css') {
        await addStylesheet(font.ref.location);
      } else if (font.data) {
        const wght = font.info?.axes?.find((a) => a.tag === 'wght');
        const face = new FontFace(font.family, base64ToBuffer(font.data), wght ? { weight: `${wght.min} ${wght.max}` } : {});
        document.fonts.add(face);
        await face.load();
      }
      await verify(font);
    })().then(
      () => {
        font.status = 'ok';
      },
      (err) => {
        font.status = 'error';
        font.error = err instanceof Error ? err.message : String(err);
      },
    );
    font.loaded.then(refreshStatus);
    return font.loaded;
  }

  /** Throws when the browser does not end up rendering the font. */
  async function verify(font) {
    if (font.source !== 'css' && font.source !== 'system') return;
    await document.fonts.load(`16px ${quote(font.family)}`);
    if (!renders(font.family)) {
      throw new Error(font.source === 'system' ? 'Font is not installed on this system.' : `No font named "${font.family}" was defined by the stylesheet.`);
    }
  }

  /** Detects a font by comparing text width against the generic fallbacks. */
  function renders(family) {
    const ctx = /** @type {HTMLCanvasElement} */ (document.createElement('canvas')).getContext('2d');
    if (!ctx) return true;
    const text = 'mmmmmmmmmwwwwwwwlli1WQ@#';
    return ['monospace', 'serif', 'sans-serif'].some((generic) => {
      ctx.font = `48px ${generic}`;
      const base = ctx.measureText(text).width;
      ctx.font = `48px ${quote(family)}, ${generic}`;
      return ctx.measureText(text).width !== base;
    });
  }

  function refreshStatus() {
    for (const el of document.querySelectorAll('[data-status-for]')) {
      const font = fonts.get(/** @type {HTMLElement} */ (el).dataset.statusFor || '');
      if (font) el.replaceWith(statusBadge(font));
    }
  }

  function statusBadge(font) {
    const text = { loading: 'loading…', ok: 'works', error: 'failed' }[font.status || ''] || 'not loaded';
    return h('span', { class: `badge status-${font.status || 'idle'}`, 'data-status-for': font.key, title: font.error || '' }, text);
  }

  // ---------------------------------------------------------------- collection & roles

  function inCollection(key) {
    return state.collection.includes(key);
  }

  function toggleCollection(key) {
    if (inCollection(key)) {
      state.collection = state.collection.filter((k) => k !== key);
      for (const role of /** @type {const} */ (['heading', 'body', 'mono'])) {
        if (state.roles[role] === key) state.roles[role] = '';
      }
    } else {
      state.collection.push(key);
      const font = fonts.get(key);
      if (font) ensureLoaded(font);
    }
    save();
    render();
  }

  function assign(role, key) {
    if (key && !inCollection(key)) state.collection.push(key);
    state.roles[role] = key;
    const font = fonts.get(key);
    if (font) ensureLoaded(font);
    save();
    render();
  }

  function inspect(key) {
    state.inspect = key;
    state.block = '';
    state.tab = 'inspect';
    const font = fonts.get(key);
    if (font) ensureLoaded(font);
    save();
    render();
  }

  // ---------------------------------------------------------------- CSS export

  function cssFor(font) {
    switch (font.source) {
      case 'google':
        return `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="${googleCssUrl(font)}" rel="stylesheet">`;
      case 'fontsource':
        return `/* npm install @fontsource/${font.id} */\nimport '@fontsource/${font.id}';`;
      case 'css':
        return `@import url("${font.ref.location}");`;
      case 'system':
        return `/* ${font.label} is an installed system font */`;
      default: {
        const fileName = font.ref.location.split(/[\\/]/).pop().split(/[?#]/)[0];
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        const format = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }[ext] || ext;
        const src = font.source === 'url' ? font.ref.location : `./fonts/${fileName}`;
        const wght = font.info?.axes?.find((a) => a.tag === 'wght');
        return `@font-face {\n  font-family: ${quote(font.label)};\n  src: url("${src}") format("${format}");\n  font-weight: ${wght ? `${wght.min} ${wght.max}` : 'normal'};\n  font-display: swap;\n}`;
      }
    }
  }

  /** The family as a page using the exported CSS would name it. */
  function exportStack(key, generic) {
    const font = fonts.get(key);
    if (!font) return generic;
    return `${quote(font.label)}, ${FALLBACKS[font.category] || generic}`;
  }

  function exportCss() {
    const t = state.typo;
    const keys = [...new Set(Object.values(state.roles).filter(Boolean))];
    const includes = keys.map((k) => fonts.get(k)).filter(Boolean).map((f) => `/* ${f.label} */\n${cssFor(f)}`);
    const rules = [
      `body {\n  font-family: ${exportStack(state.roles.body, 'sans-serif')};\n  font-size: ${t.size}px;\n  font-weight: ${t.bodyWeight};\n  line-height: ${t.lineHeight};\n  letter-spacing: ${t.letterSpacing}em;\n}`,
      `h1, h2, h3, h4, h5, h6 {\n  font-family: ${exportStack(state.roles.heading || state.roles.body, 'sans-serif')};\n  font-weight: ${t.headingWeight};\n}`,
      `code, kbd, pre, samp {\n  font-family: ${exportStack(state.roles.mono, 'monospace')};\n}`,
    ];
    return [...includes, ...rules].join('\n\n');
  }

  // ---------------------------------------------------------------- rendering

  const app = /** @type {HTMLElement} */ (document.getElementById('app'));

  function render() {
    const scroll = document.querySelector('.content')?.scrollTop || 0;
    const tabs = [
      ['fonts', 'Fonts'],
      ['typography', 'Typography'],
      ['inspect', 'Inspect'],
      ['compare', 'Compare'],
      ['icons', 'Icons'],
    ];
    app.replaceChildren(
      h('nav', { class: 'tabs', role: 'tablist' },
        tabs.map(([id, label]) =>
          h('button', {
            class: `tab ${state.tab === id ? 'active' : ''}`,
            role: 'tab',
            'aria-selected': String(state.tab === id),
            onclick: () => { state.tab = id; save(); render(); },
          }, label, id === 'compare' && state.collection.length ? h('span', { class: 'count' }, state.collection.length) : null),
        ),
      ),
      h('main', { class: `content tab-${state.tab}` }, {
        fonts: renderFonts,
        typography: renderTypography,
        inspect: renderInspect,
        compare: renderCompare,
        icons: renderIcons,
      }[state.tab]()),
    );
    const content = document.querySelector('.content');
    if (content && scroll) content.scrollTop = scroll;
    observePreviews();
  }

  let sampleTimer = 0;
  function scheduleSampleUpdate() {
    clearTimeout(sampleTimer);
    sampleTimer = setTimeout(() => {
      for (const el of document.querySelectorAll('[data-sample]')) {
        el.textContent = /** @type {HTMLElement} */ (el).dataset.sample === 'line' ? sampleLine() : sampleText();
      }
      // Google previews only contain the characters requested so far.
      for (const font of fonts.values()) if (!font.loaded) font.previewed = false;
      observePreviews();
    }, 250);
  }

  // ---- Fonts tab

  function renderFonts() {
    const sources = [
      ['google', 'Google Fonts'],
      ['custom', 'My Fonts'],
      ['system', 'System'],
    ];
    return h('div', { class: 'fonts-layout' },
      h('section', { class: 'browser' },
        h('div', { class: 'segmented' },
          sources.map(([id, label]) =>
            h('button', { class: state.source === id ? 'active' : '', onclick: () => { state.source = id; visibleCount = PAGE_SIZE; save(); render(); } }, label),
          ),
        ),
        { google: renderCatalog, custom: renderCustom, system: renderSystem }[state.source](),
      ),
      renderCollectionPanel(),
    );
  }

  function renderCatalog() {
    if (!catalog) {
      requestCatalog();
      return h('p', { class: 'muted' }, catalogError ? `Catalog unavailable: ${catalogError}` : 'Loading the Google Fonts catalog…');
    }
    const categories = [...new Set(catalog.map((f) => f.category))].sort();
    const subsets = [...new Set(catalog.flatMap((f) => f.subsets))].sort();
    const q = state.query.toLowerCase();
    const pool = [...fonts.values()].filter((f) => f.source === 'google' || (state.includeOther && f.source === 'fontsource'));
    const matches = pool.filter(
      (f) =>
        (!q || f.label.toLowerCase().includes(q)) &&
        (!state.category || f.category === state.category) &&
        (!state.subset || f.subsets.includes(state.subset)),
    );
    const list = h('div', { class: 'cards' }, matches.slice(0, visibleCount).map(fontCard));
    return h('div', null,
      sampleBox(false),
      h('div', { class: 'filters' },
        h('input', {
          type: 'search', placeholder: `Search ${pool.length} fonts…`, value: state.query, 'aria-label': 'Search fonts',
          oninput: (e) => { state.query = e.target.value; visibleCount = PAGE_SIZE; save(); rerenderKeepingFocus(e.target); },
        }),
        select('Category', state.category, [['', 'All categories'], ...categories.map((c) => [c, c])], (v) => { state.category = v; visibleCount = PAGE_SIZE; }),
        select('Script', state.subset, [['', 'All scripts'], ...subsets.map((s) => [s, s])], (v) => { state.subset = v; visibleCount = PAGE_SIZE; }),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: state.includeOther, onchange: (e) => { state.includeOther = e.target.checked; save(); render(); } }),
          'Other open fonts (Fontsource)',
        ),
      ),
      h('p', { class: 'muted small' }, `${matches.length} fonts`),
      list,
      matches.length > visibleCount
        ? h('button', { class: 'secondary more', onclick: () => { visibleCount += PAGE_SIZE; render(); } }, `Show more (${matches.length - visibleCount} left)`)
        : null,
    );
  }

  function rerenderKeepingFocus(input) {
    const pos = input.selectionStart;
    render();
    const next = /** @type {HTMLInputElement|null} */ (document.querySelector('.filters input[type=search], .system-filter, .fp-icon-search'));
    if (next) {
      next.focus();
      next.setSelectionRange(pos, pos);
    }
  }

  function select(label, value, options, onChange) {
    return h('select', { 'aria-label': label, onchange: (e) => { onChange(e.target.value); save(); render(); } },
      options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)),
    );
  }

  function fontCard(font) {
    const meta = [
      font.category !== 'other' ? font.category : null,
      font.source === 'fontsource' ? 'Fontsource' : null,
      ['file', 'url', 'css', 'system'].includes(font.source) ? { file: 'local file', url: 'web font URL', css: 'stylesheet', system: 'system font' }[font.source] : null,
      font.variable ? 'variable' : font.weights.length > 1 ? `${font.weights.length} weights` : null,
      font.subsets.length ? font.subsets.slice(0, 4).join(', ') + (font.subsets.length > 4 ? ` +${font.subsets.length - 4}` : '') : null,
    ].filter(Boolean);
    const isCustom = font.key.startsWith('custom:') || font.key === 'opened-file';
    return h('article', { class: 'card', 'data-preview': font.key },
      h('header', null,
        h('h3', { style: { fontFamily: stack(font.key) } }, font.label),
        isCustom ? statusBadge(font) : null,
      ),
      h('p', { class: 'card-sample', style: { fontFamily: stack(font.key) }, 'data-sample': 'line' }, sampleLine()),
      h('footer', null,
        h('span', { class: 'muted small' }, meta.join(' · ')),
        h('div', { class: 'actions' },
          h('button', { class: inCollection(font.key) ? 'icon active' : 'icon', title: inCollection(font.key) ? 'Remove from collection' : 'Add to collection', 'aria-pressed': String(inCollection(font.key)), onclick: () => toggleCollection(font.key) }, inCollection(font.key) ? '★' : '☆'),
          roleButton('heading', 'H', 'Use for headings', font.key),
          roleButton('body', 'Body', 'Use for body text', font.key),
          roleButton('mono', 'Code', 'Use for code', font.key),
          h('button', { class: 'secondary', onclick: () => inspect(font.key) }, 'Inspect'),
          font.key === 'opened-file' ? h('button', { class: 'secondary', onclick: () => vscode.postMessage({ type: 'keep', font: font.ref }) }, 'Keep in My Fonts') : null,
          font.key.startsWith('custom:') ? h('button', { class: 'icon danger', title: 'Remove font', onclick: () => removeCustom(font) }, '✕') : null,
        ),
      ),
    );
  }

  function roleButton(role, text, title, key) {
    const active = state.roles[role] === key;
    return h('button', { class: active ? 'role active' : 'role', title, 'aria-pressed': String(active), onclick: () => assign(role, active ? '' : key) }, text);
  }

  function removeCustom(font) {
    vscode.postMessage({ type: 'remove', id: font.ref.id });
    fonts.delete(font.key);
    state.collection = state.collection.filter((k) => k !== font.key);
    for (const role of /** @type {const} */ (['heading', 'body', 'mono'])) if (state.roles[role] === font.key) state.roles[role] = '';
    save();
    render();
  }

  function renderCustom() {
    const custom = [...fonts.values()].filter((f) => f.key.startsWith('custom:') || f.key === 'opened-file');
    let urlInput, labelInput;
    return h('div', null,
      sampleBox(false),
      h('div', { class: 'add-panel' },
        h('div', { class: 'add-row' },
          h('button', { onclick: () => vscode.postMessage({ type: 'addFile' }) }, 'Add font file…'),
          h('span', { class: 'muted small' }, 'TTF, OTF, WOFF, WOFF2'),
        ),
        h('form', {
          class: 'add-row',
          onsubmit: (e) => {
            e.preventDefault();
            if (urlInput.value.trim()) vscode.postMessage({ type: 'addUrl', url: urlInput.value, label: labelInput.value });
          },
        },
          (urlInput = h('input', { type: 'url', placeholder: 'https://… font file or stylesheet (.woff2, .css, Google Fonts / Adobe Fonts link)', 'aria-label': 'Font URL', required: true })),
          (labelInput = h('input', { type: 'text', placeholder: 'CSS family name (for stylesheets)', 'aria-label': 'Family name', class: 'narrow' })),
          h('button', { type: 'submit' }, 'Add URL'),
        ),
        h('p', { class: 'muted small' }, 'For stylesheets, enter the family name the stylesheet defines. Each added font is tested: the badge shows whether it actually renders.'),
      ),
      custom.length ? h('div', { class: 'cards' }, custom.map(fontCard)) : h('p', { class: 'muted' }, 'No fonts added yet.'),
    );
  }

  function renderSystem() {
    if (!systemFamilies) {
      vscode.postMessage({ type: 'systemFonts' });
      return h('p', { class: 'muted' }, 'Reading installed fonts…');
    }
    let nameInput;
    const q = state.query.toLowerCase();
    const shown = systemFamilies.filter((f) => !q || f.toLowerCase().includes(q));
    return h('div', null,
      h('form', {
        class: 'add-row',
        onsubmit: (e) => { e.preventDefault(); if (nameInput.value.trim()) vscode.postMessage({ type: 'addSystem', family: nameInput.value.trim() }); },
      },
        (nameInput = h('input', { type: 'text', placeholder: 'Installed font family name, e.g. Arial', 'aria-label': 'System font family' })),
        h('button', { type: 'submit' }, 'Test & add'),
      ),
      systemFamilies.length
        ? [
            h('input', {
              class: 'system-filter', type: 'search', placeholder: `Filter ${systemFamilies.length} installed families…`, value: state.query, 'aria-label': 'Filter installed fonts',
              oninput: (e) => { state.query = e.target.value; save(); rerenderKeepingFocus(e.target); },
            }),
            h('ul', { class: 'system-list' },
              shown.slice(0, 400).map((family) =>
                h('li', null,
                  h('span', { style: { fontFamily: `${quote(family)}, sans-serif` } }, family),
                  h('button', { class: 'secondary', onclick: () => vscode.postMessage({ type: 'addSystem', family }) }, 'Add'),
                ),
              ),
            ),
          ]
        : h('p', { class: 'muted small' }, 'No installed fonts found. You can still add a font by name.'),
    );
  }

  function renderCollectionPanel() {
    const roleSelect = (role, label, generic) =>
      h('label', { class: 'field' },
        h('span', null, label),
        h('select', { onchange: (e) => assign(role, e.target.value) },
          h('option', { value: '' }, `Default (${generic})`),
          state.collection.map((k) => fonts.get(k)).filter(Boolean).map((f) => h('option', { value: f.key, selected: state.roles[role] === f.key }, f.label)),
        ),
      );
    return h('aside', { class: 'collection' },
      h('h2', null, 'Collection'),
      state.collection.length
        ? h('ul', { class: 'chips' },
            state.collection.map((k) => {
              const font = fonts.get(k);
              if (!font) return null;
              return h('li', null,
                h('button', { class: 'link', style: { fontFamily: stack(k) }, onclick: () => inspect(k) }, font.label),
                h('button', { class: 'icon', title: 'Remove from collection', onclick: () => toggleCollection(k) }, '✕'),
              );
            }),
          )
        : h('p', { class: 'muted small' }, 'Star fonts to collect them here.'),
      roleSelect('heading', 'Headings', 'body font'),
      roleSelect('body', 'Body', 'sans-serif'),
      roleSelect('mono', 'Code', 'monospace'),
      h('div', { class: 'stack' },
        h('button', { onclick: () => { state.tab = 'typography'; save(); render(); } }, 'Show typography page'),
        cssButtons(exportCss),
      ),
    );
  }

  /** Copy and Insert buttons for generated CSS. */
  function cssButtons(css) {
    return h('div', { class: 'button-row' },
      h('button', { class: 'secondary', onclick: () => vscode.postMessage({ type: 'copy', text: css(), what: 'CSS' }) }, 'Copy CSS'),
      h('button', { class: 'secondary', title: 'Insert into the last active editor', onclick: () => vscode.postMessage({ type: 'insert', text: css(), what: 'CSS' }) }, 'Insert CSS'),
    );
  }

  /** Downloads the font files into the workspace and writes a stylesheet (see projectFonts.ts). */
  function addToProject(font) {
    const catalog = font.source === 'google' || font.source === 'fontsource';
    vscode.postMessage({
      type: 'addToProject',
      font: {
        label: font.label,
        source: font.source,
        location: catalog ? font.id : font.ref.location,
        category: font.category,
        defSubset: font.defSubset,
        info: font.info,
      },
    });
  }

  function canAddToProject(font) {
    return ['google', 'fontsource', 'file', 'url'].includes(font.source);
  }

  // ---- Typography tab

  function renderTypography() {
    const t = state.typo;
    const headingFont = stack(state.roles.heading || state.roles.body);
    const bodyFont = stack(state.roles.body);
    const monoFont = stack(state.roles.mono, 'monospace');
    for (const key of Object.values(state.roles)) {
      const font = fonts.get(key);
      if (font) ensureLoaded(font);
    }
    const range = (label, prop, min, max, step, unit = '') =>
      h('label', { class: 'field' },
        h('span', null, label, ' ', h('output', null, `${t[prop]}${unit}`)),
        h('input', {
          type: 'range', min, max, step, value: t[prop],
          oninput: (e) => {
            t[prop] = Number(e.target.value);
            e.target.previousElementSibling.querySelector('output').textContent = `${t[prop]}${unit}`;
            applyTypo();
            save();
          },
        }),
      );
    const fontSelect = (role, label, generic) =>
      h('label', { class: 'field' },
        h('span', null, label),
        h('select', { onchange: (e) => assign(role, e.target.value) },
          h('option', { value: '' }, `Default (${generic})`),
          state.collection.map((k) => fonts.get(k)).filter(Boolean).map((f) => h('option', { value: f.key, selected: state.roles[role] === f.key }, f.label)),
        ),
      );

    const sample = sampleText();
    const page = h('article', {
      class: `typo-page theme-${t.theme}`,
      style: { '--heading-font': headingFont, '--body-font': bodyFont, '--mono-font': monoFont },
    },
      h('section', null,
        h('h2', { class: 'section-title' }, 'Sample text'),
        h('p', { class: 'sample-paragraph' }, sample),
        h('p', { class: 'sample-paragraph sample-heading' }, sample),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Headings'),
        [1, 2, 3, 4, 5, 6].map((n) => h(`h${n}`, null, `h${n}. ${headingText()}`)),
        h('h3', null, 'Fancy display heading ', h('small', { class: 'text-muted' }, 'With faded secondary text')),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Display headings'),
        [1, 2, 3, 4, 5, 6].map((n) => h('p', { class: `display-${n}` }, `Display ${n}`)),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Lead & body'),
        h('p', { class: 'lead' }, 'This is a lead paragraph. It stands out from regular paragraphs and introduces the content that follows.'),
        h('p', { class: 'sample-paragraph' }, sample),
        h('p', null,
          'Typography sets the tone of a page. Good body text is easy to read at length: comfortable size, generous line height and a measure of 60–75 characters. ',
          'Numbers matter too: 0123456789, ½ ¼ ¾, 1st 2nd 3rd, €12.50, $99, 100 %.',
        ),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Inline text elements'),
        h('p', null, 'You can use the mark tag to ', h('mark', null, 'highlight'), ' text.'),
        h('p', null, h('del', null, 'This line of text is meant to be treated as deleted text.')),
        h('p', null, h('s', null, 'This line of text is meant to be treated as no longer accurate.')),
        h('p', null, h('ins', null, 'This line of text is meant to be treated as an addition to the document.')),
        h('p', null, h('u', null, 'This line of text will render as underlined.')),
        h('p', null, h('small', null, 'This line of text is meant to be treated as fine print.')),
        h('p', null, h('strong', null, 'This line rendered as bold text.')),
        h('p', null, h('em', null, 'This line rendered as italicized text.')),
        h('p', null, h('abbr', { title: 'HyperText Markup Language' }, 'HTML'), ' abbreviations, ', h('kbd', null, 'Ctrl'), ' + ', h('kbd', null, 'S'), ', inline ', h('code', null, 'font-family: var(--body)'), ', H', h('sub', null, '2'), 'O and E = mc', h('sup', null, '2'), '.'),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Blockquote'),
        h('figure', null,
          h('blockquote', { class: 'blockquote' }, h('p', null, 'Typography is what language looks like.')),
          h('figcaption', { class: 'blockquote-footer' }, 'Ellen Lupton, ', h('cite', null, 'Thinking with Type')),
        ),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Lists'),
        h('div', { class: 'columns' },
          h('ul', null, h('li', null, 'Unordered list item'), h('li', null, 'Another item', h('ul', null, h('li', null, 'Nested item'), h('li', null, 'Nested item'))), h('li', null, 'Last item')),
          h('ol', null, h('li', null, 'First step'), h('li', null, 'Second step'), h('li', null, 'Third step')),
          h('dl', null, h('dt', null, 'Description lists'), h('dd', null, 'Perfect for defining terms.'), h('dt', null, 'Term'), h('dd', null, 'Definition of the term.')),
        ),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Code'),
        h('pre', null, h('code', null, 'function greet(name) {\n  return `Hello, ${name}!`; // 0O 1lI {}[]()\n}')),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Table'),
        h('table', null,
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Weight'), h('th', null, 'Use'), h('th', { class: 'num' }, 'Size'))),
          h('tbody', null,
            [['1', 'Regular 400', 'Body copy', '16px'], ['2', 'Semibold 600', 'Subheadings', '20px'], ['3', 'Bold 700', 'Headlines', '40px']].map((row) =>
              h('tr', null, row.map((c, i) => h('td', { class: i === 3 ? 'num' : '' }, c))),
            ),
          ),
        ),
      ),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Form & buttons'),
        h('div', { class: 'form-demo' },
          h('label', null, 'Email address', h('input', { type: 'email', placeholder: 'name@example.com' })),
          h('div', null, h('button', { class: 'btn' }, 'Primary'), ' ', h('button', { class: 'btn btn-outline' }, 'Secondary')),
        ),
      ),
    );

    function applyTypo() {
      page.style.setProperty('--size', `${t.size}px`);
      page.style.setProperty('--line-height', String(t.lineHeight));
      page.style.setProperty('--letter-spacing', `${t.letterSpacing}em`);
      page.style.setProperty('--heading-weight', String(t.headingWeight));
      page.style.setProperty('--body-weight', String(t.bodyWeight));
    }
    applyTypo();

    return h('div', { class: 'typo-layout' },
      h('aside', { class: 'typo-controls' },
        h('label', { class: 'field' }, h('span', null, 'Sample text'), sampleBox(true)),
        state.collection.length ? null : h('p', { class: 'muted small' }, 'Add fonts to your collection on the Fonts tab to choose them here.'),
        fontSelect('heading', 'Headings', 'body font'),
        fontSelect('body', 'Body', 'sans-serif'),
        fontSelect('mono', 'Code', 'monospace'),
        range('Heading weight', 'headingWeight', 100, 900, 100),
        range('Body weight', 'bodyWeight', 100, 900, 100),
        range('Base size', 'size', 12, 24, 1, 'px'),
        range('Line height', 'lineHeight', 1, 2.2, 0.05),
        range('Letter spacing', 'letterSpacing', -0.05, 0.2, 0.005, 'em'),
        h('label', { class: 'field' },
          h('span', null, 'Page'),
          select('Page theme', t.theme, [['light', 'Light'], ['dark', 'Dark'], ['editor', 'Editor theme']], (v) => { t.theme = v; }),
        ),
        cssButtons(exportCss),
      ),
      page,
    );
  }

  // ---- Inspect tab

  function renderInspect() {
    const customKeys = [...fonts.keys()].filter((k) => k.startsWith('custom:'));
    const choices = [...new Set([openedKey, ...state.collection, ...customKeys, state.inspect].filter(Boolean))].map((k) => fonts.get(k)).filter(Boolean);
    const font = fonts.get(state.inspect) || choices[0];
    if (!font) return h('p', { class: 'muted' }, 'Choose "Inspect" on a font to see its glyphs, weights and details.');
    if (font.key !== state.inspect) state.inspect = font.key;
    ensureLoaded(font);
    loadDetails(font);
    const family = stack(font.key);
    const info = font.info;

    return h('div', { class: 'inspect' },
      h('header', { class: 'inspect-head' },
        h('select', { 'aria-label': 'Font', onchange: (e) => inspect(e.target.value) },
          choices.map((f) => h('option', { value: f.key, selected: f.key === font.key }, f.label)),
        ),
        statusBadge(font),
        h('button', { class: inCollection(font.key) ? 'icon active' : 'icon', title: 'Collection', onclick: () => toggleCollection(font.key) }, inCollection(font.key) ? '★' : '☆'),
        cssButtons(() => cssFor(font)),
        canAddToProject(font) ? h('button', { title: 'Download the font files into the workspace and write a stylesheet', onclick: () => addToProject(font) }, 'Add to project…') : null,
      ),
      h('h1', { class: 'specimen', style: { fontFamily: family } }, font.label),
      font.status === 'error' ? h('p', { class: 'error' }, font.error || 'The font could not be loaded.') : null,
      renderTextPreview(font),
      h('h2', null, 'Details'),
      renderDetails(font),
      font.variable && info?.axes?.length ? renderAxes(font) : null,
      h('h2', null, 'Weights'),
      h('div', { class: 'weights' },
        weightSteps(font).map((w) =>
          h('div', { class: 'weight-row' },
            h('span', { class: 'muted small' }, w),
            h('span', { style: { fontFamily: family, fontWeight: w }, 'data-sample': 'line' }, sampleLine()),
            font.styles.includes('italic') ? h('span', { style: { fontFamily: family, fontWeight: w, fontStyle: 'italic' } }, 'Italic') : null,
          ),
        ),
      ),
      h('h2', null, 'Sizes'),
      h('div', { class: 'waterfall' },
        [12, 14, 16, 20, 24, 32, 48, 64].map((size) =>
          h('div', { class: 'size-row' }, h('span', { class: 'muted small' }, `${size}px`), h('span', { style: { fontFamily: family, fontSize: `${size}px` }, 'data-sample': 'line' }, sampleLine())),
        ),
      ),
      renderGlyphs(font),
    );
  }

  /** User-facing OpenType features. Shaping features (ccmp, mark, locl, …) are always on and not listed. */
  const FEATURES = {
    liga: 'Standard ligatures', clig: 'Contextual ligatures', dlig: 'Discretionary ligatures', hlig: 'Historical ligatures',
    calt: 'Contextual alternates', kern: 'Kerning', smcp: 'Small caps', c2sc: 'Capitals to small caps',
    pcap: 'Petite caps', c2pc: 'Capitals to petite caps', unic: 'Unicase', case: 'Case-sensitive forms', cpsp: 'Capital spacing',
    titl: 'Titling', lnum: 'Lining figures', onum: 'Old-style figures', pnum: 'Proportional figures', tnum: 'Tabular figures',
    zero: 'Slashed zero', frac: 'Fractions', afrc: 'Alternative fractions', ordn: 'Ordinals', sups: 'Superscript',
    subs: 'Subscript', sinf: 'Scientific inferiors', salt: 'Stylistic alternates', swsh: 'Swash', cswh: 'Contextual swash',
    hist: 'Historical forms', nalt: 'Alternate annotation forms', ornm: 'Ornaments', jalt: 'Justification alternates',
  };
  /** Features browsers turn on by default. */
  const DEFAULT_ON = ['liga', 'clig', 'calt', 'kern'];
  /** Shown when the font's feature list is unknown (system fonts, stylesheets). */
  const COMMON_FEATURES = ['liga', 'dlig', 'calt', 'kern', 'smcp', 'c2sc', 'case', 'lnum', 'onum', 'pnum', 'tnum', 'zero', 'frac', 'ordn', 'sups', 'subs', 'salt', 'swsh', 'ss01', 'ss02', 'ss03'];

  function featureLabel(tag) {
    if (/^ss\d\d$/.test(tag)) return `Stylistic set ${Number(tag.slice(2))}`;
    if (/^cv\d\d$/.test(tag)) return `Character variant ${Number(tag.slice(2))}`;
    return FEATURES[tag] || tag;
  }

  /**
   * Google Fonts and Fontsource serve subsetted files without many optional features. When
   * features are tested, the complete font file is loaded under a private family name.
   */
  function loadFullFont(font) {
    const url = font.info?.fileUrl;
    if (!url || font.full) return font.full;
    const family = `FP full ${font.key}`;
    const wght = font.info.axes.find((a) => a.tag === 'wght');
    const face = new FontFace(family, `url(${url})`, wght ? { weight: `${wght.min} ${wght.max}` } : {});
    document.fonts.add(face);
    font.full = face.load().then(() => family, () => undefined);
    return font.full;
  }

  /** Font stack of the text preview: the complete font file when it is loaded. */
  function previewStack(font) {
    return font.fullFamily ? `${quote(font.fullFamily)}, ${stack(font.key)}` : stack(font.key);
  }

  /** Feature tags offered for a font, and whether they come from the font itself. */
  function fontFeatures(font) {
    const own = font.info?.features;
    if (!own) return { tags: COMMON_FEATURES, known: false };
    return { tags: own.filter((t) => t in FEATURES || /^(ss|cv)\d\d$/.test(t)), known: true };
  }

  /** CSS value for the features the user changed from the browser default. */
  function featureSettings(font) {
    const changed = Object.entries(state.features[font.key] || {})
      .filter(([tag, on]) => on !== DEFAULT_ON.includes(tag))
      .map(([tag, on]) => `"${tag}" ${on ? 1 : 0}`);
    return changed.length ? changed.join(', ') : 'normal';
  }

  function renderFeatures(font, onChange) {
    const { tags, known } = fontFeatures(font);
    const values = (state.features[font.key] ||= {});
    const css = () => `font-feature-settings: ${featureSettings(font)};`;
    const cssOut = h('code', { class: 'feature-css' }, css());
    const chips = tags.map((tag) => {
      const on = () => values[tag] ?? DEFAULT_ON.includes(tag);
      const chip = h('button', {
        class: `feature ${on() ? 'active' : ''}`,
        title: `${tag}: ${featureLabel(tag)}`,
        'aria-pressed': String(on()),
        onclick: () => {
          values[tag] = !on();
          chip.classList.toggle('active', on());
          chip.setAttribute('aria-pressed', String(on()));
          cssOut.textContent = css();
          save();
          onChange();
        },
      }, h('span', { class: 'feature-tag' }, tag), ' ', featureLabel(tag));
      return chip;
    });
    return h('div', { class: 'features' },
      h('div', { class: 'features-head' },
        h('h3', null, 'OpenType features'),
        h('span', { class: 'muted small' }, known
          ? (tags.length === 1 ? '1 feature in this font' : tags.length ? `${tags.length} features in this font` : 'This font has no optional OpenType features.')
          : 'The font\'s feature list is unknown; these are common features.'),
        h('span', { class: 'spacer' }),
        cssOut,
        h('button', { class: 'icon', title: 'Copy CSS', onclick: () => vscode.postMessage({ type: 'copy', text: css(), what: 'CSS' }) }, '⧉'),
        h('button', { class: 'icon', title: 'Insert into editor', onclick: () => vscode.postMessage({ type: 'insert', text: css(), what: 'CSS' }) }, '↵'),
        h('button', { class: 'secondary', onclick: () => { state.features[font.key] = {}; save(); render(); } }, 'Reset'),
      ),
      h('div', { class: 'feature-chips' }, chips),
    );
  }

  /** Multi-line sample text set in the font, with size, weight, leading and alignment controls. */
  function renderTextPreview(font) {
    const p = state.preview;
    const text = h('div', { class: 'text-preview', dir: 'auto', 'data-sample': '' }, sampleText());
    const apply = () => {
      Object.assign(text.style, {
        fontFamily: previewStack(font),
        fontSize: `${p.size}px`,
        fontWeight: String(p.weight),
        lineHeight: String(p.lineHeight),
        textAlign: p.align,
        fontFeatureSettings: featureSettings(font),
      });
    };
    apply();
    const useFullFont = () => {
      if (featureSettings(font) === 'normal' || font.fullFamily) return;
      loadFullFont(font)?.then((family) => {
        if (!family) return;
        font.fullFamily = family;
        apply();
      });
    };
    useFullFont();
    const slider = (label, prop, min, max, step, unit = '') => {
      const out = h('output', null, `${p[prop]}${unit}`);
      return h('label', { class: 'field inline' },
        h('span', null, label, ' ', out),
        h('input', {
          type: 'range', min, max, step, value: p[prop],
          oninput: (e) => { p[prop] = Number(e.target.value); out.textContent = `${p[prop]}${unit}`; apply(); save(); },
        }),
      );
    };
    return h('section', { class: 'text-test' },
      h('h2', null, 'Text'),
      sampleBox(true),
      h('div', { class: 'filters' },
        slider('Size', 'size', 10, 160, 1, 'px'),
        slider('Weight', 'weight', 100, 900, 100),
        slider('Line height', 'lineHeight', 0.8, 2.4, 0.05),
        h('div', { class: 'segmented compact', role: 'group', 'aria-label': 'Alignment' },
          [['start', 'Left'], ['center', 'Center'], ['end', 'Right'], ['justify', 'Justify']].map(([v, label]) =>
            h('button', { class: p.align === v ? 'active' : '', onclick: (e) => {
              p.align = v;
              save();
              apply();
              for (const b of e.target.parentElement.children) b.classList.toggle('active', b === e.target);
            } }, label),
          ),
        ),
      ),
      renderFeatures(font, () => {
        apply();
        useFullFont();
      }),
      text,
    );
  }

  function weightSteps(font) {
    if (font.variable && font.weights.length) {
      const min = Math.min(...font.weights);
      const max = Math.max(...font.weights);
      return [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((w) => w >= min && w <= max);
    }
    return font.weights.length ? font.weights : [400];
  }

  function renderDetails(font) {
    const info = font.info;
    const rows = [
      ['Source', { google: 'Google Fonts', fontsource: 'Fontsource', file: 'Local file', url: 'Web font URL', css: 'Stylesheet', system: 'System font' }[font.source]],
      font.ref ? ['Location', font.ref.location] : null,
      info?.family && info.family !== font.label ? ['Internal family', info.family] : null,
      info ? ['Format', info.format.toUpperCase()] : null,
      info?.fontCount ? ['Collection', `${info.fontCount} fonts, details of the first one`] : null,
      info?.subfamily ? ['Style', info.subfamily] : null,
      info?.version ? ['Version', info.version] : null,
      info?.designer ? ['Designer', info.designer] : null,
      info?.numGlyphs ? ['Glyphs', `${info.numGlyphs} glyphs, ${info.ranges.reduce((n, [a, b]) => n + b - a + 1, 0)} mapped characters`] : null,
      font.subsets.length ? ['Scripts', font.subsets.join(', ')] : null,
      font.category !== 'other' ? ['Category', font.category] : null,
      info?.license ? ['License', info.license] : null,
      !info && font.details && !font.detailsError ? ['Details', 'Reading the complete font file…'] : null,
      font.detailsError ? ['Details', `Not available: ${font.detailsError}`] : null,
    ].filter(Boolean);
    return h('dl', { class: 'details' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  }

  function renderAxes(font) {
    const values = {};
    const target = h('p', { class: 'axes-sample', style: { fontFamily: stack(font.key) }, 'data-sample': '' }, sampleText());
    const apply = () => {
      target.style.fontVariationSettings = Object.entries(values).map(([tag, v]) => `"${tag}" ${v}`).join(', ');
    };
    return h('div', { class: 'axes' },
      h('h2', null, 'Variable axes'),
      font.info.axes.map((axis) => {
        values[axis.tag] = axis.default;
        const out = h('output', null, axis.default);
        return h('label', { class: 'field inline' },
          h('span', null, axis.tag, ' ', out),
          h('input', {
            type: 'range', min: axis.min, max: axis.max, step: axis.max - axis.min >= 10 ? 1 : 0.01, value: axis.default,
            oninput: (e) => { values[axis.tag] = Number(e.target.value); out.textContent = String(Math.round(values[axis.tag] * 10) / 10); apply(); },
          }),
        );
      }),
      target,
    );
  }

  function renderGlyphs(font) {
    const ranges = font.info?.ranges;
    const covered = (a, b) => (ranges ? ranges.reduce((n, [s, e]) => n + Math.max(0, Math.min(b, e) - Math.max(a, s) + 1), 0) : null);
    const options = [];
    if (ranges) options.push(['covered', `All mapped characters (${covered(0, 0x10ffff)})`]);
    for (const [name, start, end, subset] of BLOCKS) {
      const n = covered(start, end);
      if (n === 0) continue;
      const supported = !ranges && subset && font.subsets.includes(subset);
      options.push([`${start}-${end}`, `${name}${n !== null ? ` (${n})` : supported ? ' ✓' : ''}`]);
    }
    let block = state.block;
    if (!options.some(([v]) => v === block)) {
      if (ranges) block = 'covered';
      else {
        const preferred = BLOCKS.find(([, , , subset]) => subset && subset !== 'latin' && font.subsets.includes(subset) && font.subsets.length <= 3);
        block = preferred ? `${preferred[1]}-${preferred[2]}` : `${0x20}-${0x7f}`;
      }
    }

    /** @type {number[]} */
    const codes = [];
    if (block === 'covered') {
      for (const [s, e] of ranges) for (let c = s; c <= e && codes.length < GLYPH_LIMIT; c++) if (c >= 0x20) codes.push(c);
    } else {
      const [s, e] = block.split('-').map(Number);
      for (let c = s; c <= e && codes.length < GLYPH_LIMIT; c++) {
        if (!ranges || ranges.some(([a, b]) => c >= a && c <= b)) codes.push(c);
      }
    }

    const detail = h('div', { class: 'glyph-detail', hidden: true });
    let selectedCell = null;
    const showDetail = (cp, cell) => {
      selectedCell?.classList.remove('selected');
      selectedCell = cell;
      cell.classList.add('selected');
      detail.hidden = false;
      detail.replaceChildren(
        h('div', { class: 'glyph-big', style: { fontFamily: stack(font.key) } }, glyphText(cp)),
        h('p', { class: 'glyph-title' }, `U+${hex(cp)}`),
        snippetPanel(snippets(cp), stack(font.key)),
      );
    };

    return h('section', { class: 'glyphs' },
      h('div', { class: 'glyph-head' },
        h('h2', null, 'Glyphs'),
        insertBar(false),
        h('select', { 'aria-label': 'Unicode block', onchange: (e) => { state.block = e.target.value; save(); render(); } },
          options.map(([v, label]) => h('option', { value: v, selected: v === block }, label)),
        ),
        ranges && !font.info.partial ? null : h('span', { class: 'muted small' }, font.info?.partial
          ? 'Coverage of the default subset only.'
          : 'Characters missing from this font are drawn with a fallback font.'),
      ),
      h('div', { class: 'glyph-area' },
        h('div', { class: 'glyph-grid', style: { fontFamily: stack(font.key) } },
          codes.map((cp) =>
            h('button', {
              class: 'glyph', title: `U+${hex(cp)} · double-click to insert`,
              onclick: (e) => showDetail(cp, e.currentTarget),
              ondblclick: () => insertSnippet(snippets(cp)),
            },
              h('span', { class: 'glyph-char' }, glyphText(cp)),
              h('span', { class: 'glyph-code' }, hex(cp)),
            ),
          ),
        ),
        detail,
      ),
      codes.length >= GLYPH_LIMIT ? h('p', { class: 'muted small' }, `Showing the first ${GLYPH_LIMIT} characters.`) : null,
    );
  }

  // ---- Compare tab

  function renderCompare() {
    const keys = state.collection.filter((k) => fonts.has(k));
    if (!keys.length) return h('p', { class: 'muted' }, 'Star fonts on the Fonts tab to compare them here.');
    keys.forEach((k) => ensureLoaded(/** @type {Font} */ (fonts.get(k))));
    const rows = h('div', { class: 'compare-rows' },
      keys.map((k) => {
        const font = /** @type {Font} */ (fonts.get(k));
        return h('div', { class: 'compare-row' },
          h('div', { class: 'compare-meta' },
            h('button', { class: 'link', onclick: () => inspect(k) }, font.label),
            statusBadge(font),
            h('button', { class: 'icon', title: 'Remove from collection', onclick: () => toggleCollection(k) }, '✕'),
          ),
          h('p', { class: 'compare-text', style: { fontFamily: stack(k) }, 'data-sample': '' }, sampleText()),
        );
      }),
    );
    const applySize = () => {
      rows.style.setProperty('--compare-size', `${state.compareSize}px`);
      rows.style.setProperty('--compare-weight', String(state.compareWeight));
    };
    applySize();
    return h('div', null,
      sampleBox(true),
      h('div', { class: 'filters' },
        h('label', { class: 'field inline' }, h('span', null, 'Size'), h('input', { type: 'range', min: 12, max: 120, value: state.compareSize, oninput: (e) => { state.compareSize = Number(e.target.value); applySize(); save(); } })),
        h('label', { class: 'field inline' }, h('span', null, 'Weight'), h('input', { type: 'range', min: 100, max: 900, step: 100, value: state.compareWeight, oninput: (e) => { state.compareWeight = Number(e.target.value); applySize(); save(); } })),
      ),
      rows,
    );
  }

  let requestId = 0;
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
  const pending = new Map();
  /** Sends a message that the extension answers with a `response` carrying the same id. */
  function request(type, payload) {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      vscode.postMessage({ type, id, ...payload });
    });
  }

  /** Loads exact coverage, axes and features of a catalog font from its full font file. */
  function loadDetails(font) {
    if (font.info || font.details || (font.source !== 'google' && font.source !== 'fontsource')) return;
    font.details = request('fontDetails', { source: font.source, fontId: font.id, family: font.family }).then(
      (info) => {
        font.info = info;
        // Google serves only the requested axes; ask again for all of them.
        if (font.source === 'google' && info.axes.some((a) => a.tag !== 'wght')) {
          addStylesheet(googleCssUrl(font, undefined, true)).catch(() => undefined);
        }
        if (state.tab === 'inspect' && state.inspect === font.key) render();
      },
      (err) => {
        font.detailsError = err.message;
        if (state.tab === 'inspect' && state.inspect === font.key) render();
      },
    );
  }

  /**
   * Inspects the font of `pendingFamily`: a font of the collection, My Fonts or the catalog with
   * that name, else the installed font of that name (added to My Fonts and tested).
   */
  function inspectPendingFamily() {
    if (!pendingFamily) return;
    const name = pendingFamily.toLowerCase();
    const all = [...fonts.values()];
    const found =
      all.find((f) => f.key.startsWith('custom:') && f.label.toLowerCase() === name) ||
      all.find((f) => f.source === 'google' && f.label.toLowerCase() === name) ||
      all.find((f) => f.label.toLowerCase() === name);
    if (found) {
      pendingFamily = '';
      inspect(found.key);
    } else if (catalog) {
      vscode.postMessage({ type: 'addSystem', family: pendingFamily });
    } else {
      requestCatalog();
    }
  }

  function requestCatalog() {
    if (catalogRequested) return;
    catalogRequested = true;
    vscode.postMessage({ type: 'catalog' });
  }

  // ---------------------------------------------------------------- snippets & inserting

  const CSS_LANGS = ['css', 'scss', 'sass', 'less', 'stylus', 'postcss'];
  const JSX_LANGS = ['javascriptreact', 'typescriptreact'];
  const MARKUP_LANGS = ['html', 'vue', 'svelte', 'astro', 'php', 'markdown', 'handlebars', 'django-html', 'jinja', 'erb', 'razor', 'blade', 'xml', 'twig', 'nunjucks'];
  const SCRIPT_LANGS = ['javascript', 'typescript', 'json', 'jsonc', 'python', 'java', 'csharp', 'go', 'rust', 'dart', 'kotlin', 'swift'];

  const FORMAT_LABELS = {
    html: 'HTML', jsx: 'JSX', entity: 'HTML entity', css: 'CSS content', js: 'JS escape', char: 'Character', name: 'Name',
  };

  /** Format chosen by "Auto" for the editor that receives the insert. */
  function autoFormat(available) {
    const lang = target?.languageId || '';
    const order = CSS_LANGS.includes(lang) ? ['css']
      : JSX_LANGS.includes(lang) ? ['jsx', 'js']
      : MARKUP_LANGS.includes(lang) ? ['html', 'entity']
      : SCRIPT_LANGS.includes(lang) ? ['js']
      : ['html', 'char'];
    return order.find((f) => available.includes(f)) || 'char';
  }

  function jsEscape(cp) {
    return cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`;
  }

  /**
   * Insertable text for a code point; with `icon` also the icon set's markup.
   * @returns {Array<{ id: string, text: string }>}
   */
  function snippets(cp, icon) {
    const list = [];
    if (icon) {
      const html = icon.style.html.replace('{name}', icon.name);
      list.push({ id: 'html', text: html }, { id: 'jsx', text: html.replace(/\bclass=/g, 'className=') });
    }
    list.push(
      { id: 'css', text: `content: "\\${cp.toString(16)}";` },
      { id: 'entity', text: `&#x${hex(cp)};` },
      { id: 'js', text: jsEscape(cp) },
      { id: 'char', text: String.fromCodePoint(cp) },
    );
    if (icon) list.push({ id: 'name', text: icon.name });
    return list;
  }

  function chosenSnippet(list) {
    const ids = list.map((s) => s.id);
    const id = state.insertFormat !== 'auto' && ids.includes(state.insertFormat) ? state.insertFormat : autoFormat(ids);
    return /** @type {{ id: string, text: string }} */ (list.find((s) => s.id === id));
  }

  function insertSnippet(list) {
    const snip = chosenSnippet(list);
    vscode.postMessage({ type: 'insert', text: snip.text, what: FORMAT_LABELS[snip.id] });
  }

  /** Shows where inserts go and which format they use. */
  function insertBar(forIcons) {
    const ids = forIcons ? Object.keys(FORMAT_LABELS) : ['css', 'entity', 'js', 'char'];
    return h('div', { class: `insert-bar ${forIcons ? 'for-icons' : ''}` },
      h('span', { class: 'muted small' }, 'Insert into ', h('strong', null, target ? target.name : 'no open editor')),
      h('select', {
        'aria-label': 'Insert format',
        onchange: (e) => { state.insertFormat = e.target.value; save(); },
      },
        h('option', { value: 'auto', selected: state.insertFormat === 'auto' }, `Auto (${FORMAT_LABELS[autoFormat(ids)]})`),
        ids.map((id) => h('option', { value: id, selected: state.insertFormat === id }, FORMAT_LABELS[id])),
      ),
    );
  }

  /** Every format with copy and insert buttons; the chosen one first as the main action. */
  function snippetPanel(list, family) {
    const main = chosenSnippet(list);
    return h('div', { class: 'snippets' },
      h('button', { class: 'insert-main', onclick: () => insertSnippet(list) }, `Insert ${FORMAT_LABELS[main.id]}`),
      list.map((snip) =>
        h('div', { class: 'snippet' },
          h('span', { class: 'muted small' }, FORMAT_LABELS[snip.id]),
          h('code', { style: snip.id === 'char' && family ? { fontFamily: family } : null }, snip.text),
          h('div', { class: 'snippet-actions' },
            h('button', { class: 'icon', title: 'Copy', onclick: () => vscode.postMessage({ type: 'copy', text: snip.text, what: FORMAT_LABELS[snip.id] }) }, '⧉'),
            h('button', { class: 'icon', title: 'Insert into editor', onclick: () => vscode.postMessage({ type: 'insert', text: snip.text, what: FORMAT_LABELS[snip.id] }) }, '↵'),
          ),
        ),
      ),
    );
  }

  // ---- Icons tab

  // Icon set stylesheets style elements by class prefix (e.g. Lucide styles every
  // [class^="icon-"]), so the UI's own classes use the fp- prefix.
  const ICON_PAGE = 600;

  function renderIcons() {
    const set = iconSets.find((s) => s.id === state.iconSet) || iconSets[0];
    if (!set) return h('p', { class: 'muted' }, 'No icon sets available.');
    const style = set.styles.find((s) => s.id === state.iconStyle) || set.styles[0];
    state.iconStyle = style.id;
    const css = set.id === 'material' ? [set.css[set.styles.indexOf(style)]] : set.css;
    // Icon fonts use font-display: block, so request the face right away instead of on first paint.
    Promise.all(css.map((href) => addStylesheet(href)))
      .then(() => document.fonts.load(`${style.weight} 16px ${quote(style.family)}`))
      .catch(() => undefined);

    const data = iconData.get(set.id);
    if (!data) {
      iconData.set(set.id, 'loading');
      vscode.postMessage({ type: 'icons', set: set.id });
    }
    if (!iconVisible) iconVisible = ICON_PAGE;

    const words = state.iconQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const all = Array.isArray(data) ? data : [];
    // Name matches rank before matches that only hit a search term.
    const score = (icon) => {
      let total = 0;
      for (const w of words) {
        if (icon.name === w) total += 4;
        else if (icon.name.split('-').includes(w)) total += 3;
        else if (icon.name.includes(w)) total += 2;
        else if (icon.terms?.some((t) => t.includes(w))) total += 1;
        else return -1;
      }
      return total;
    };
    const matches = all
      .filter((icon) => !icon.styles || icon.styles.includes(style.id))
      .map((icon) => ({ icon, score: words.length ? score(icon) : 0 }))
      .filter((m) => m.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.icon);

    const familyStyle = { fontFamily: quote(style.family), fontWeight: String(style.weight), fontSize: `${state.iconSize}px` };
    const detail = h('aside', { class: 'glyph-detail fp-icon-detail', hidden: true });
    let selectedCell = null;
    const iconSnippets = (icon) => snippets(icon.code, { name: icon.name, style });
    const showDetail = (icon, cell) => {
      state.iconSelected = icon.name;
      save();
      selectedCell?.classList.remove('selected');
      selectedCell = cell;
      cell?.classList.add('selected');
      detail.hidden = false;
      detail.replaceChildren(
        h('div', { class: 'glyph-big', style: { ...familyStyle, fontSize: '96px' } }, String.fromCodePoint(icon.code)),
        h('p', { class: 'glyph-title' }, icon.name, h('span', { class: 'muted small' }, ` U+${hex(icon.code)}`)),
        snippetPanel(iconSnippets(icon), `${quote(style.family)}`),
      );
    };

    const grid = h('div', { class: 'fp-icon-grid', style: { '--icon-size': `${state.iconSize}px` } },
      matches.slice(0, iconVisible).map((icon) => {
        const cell = h('button', {
          class: `fp-icon-cell ${icon.name === state.iconSelected ? 'selected' : ''}`,
          title: `${icon.name} · double-click to insert`,
          onclick: () => showDetail(icon, cell),
          ondblclick: () => insertSnippet(iconSnippets(icon)),
        },
          h('span', { class: 'fp-icon-glyph', style: familyStyle }, String.fromCodePoint(icon.code)),
          h('span', { class: 'fp-icon-name' }, icon.name),
        );
        return cell;
      }),
    );

    const view = h('div', { class: 'icons' },
      h('div', { class: 'filters' },
        h('select', { 'aria-label': 'Icon set', onchange: (e) => { state.iconSet = e.target.value; state.iconStyle = ''; state.iconSelected = ''; iconVisible = ICON_PAGE; save(); render(); } },
          iconSets.map((s) => h('option', { value: s.id, selected: s.id === set.id }, s.label)),
        ),
        set.styles.length > 1
          ? h('div', { class: 'segmented compact' },
              set.styles.map((s) => h('button', { class: s.id === style.id ? 'active' : '', onclick: () => { state.iconStyle = s.id; iconVisible = ICON_PAGE; save(); render(); } }, s.label)),
            )
          : null,
        h('input', {
          type: 'search', class: 'fp-icon-search', placeholder: Array.isArray(data) ? `Search ${all.filter((i) => !i.styles || i.styles.includes(style.id)).length} icons…` : 'Search icons…', value: state.iconQuery, 'aria-label': 'Search icons',
          oninput: (e) => { state.iconQuery = e.target.value; iconVisible = ICON_PAGE; save(); rerenderKeepingFocus(e.target); },
        }),
        h('label', { class: 'field inline' }, h('span', null, 'Size'),
          h('input', { type: 'range', min: 16, max: 64, value: state.iconSize, oninput: (e) => { state.iconSize = Number(e.target.value); grid.style.setProperty('--icon-size', `${state.iconSize}px`); for (const g of grid.querySelectorAll('.fp-icon-glyph')) /** @type {HTMLElement} */ (g).style.fontSize = `${state.iconSize}px`; save(); } }),
        ),
      ),
      h('div', { class: 'filters' },
        insertBar(true),
        h('span', { class: 'spacer' }),
        h('span', { class: 'muted small' }, `${set.label} ${set.version !== 'latest' ? set.version : ''} · ${set.license} · `, h('a', { href: set.homepage }, set.homepage.replace('https://', ''))),
        h('button', { class: 'secondary', onclick: () => vscode.postMessage({ type: 'copy', text: css.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n'), what: 'Stylesheet link' }) }, 'Copy <link>'),
      ),
      data === 'loading' || !data ? h('p', { class: 'muted' }, `Loading ${set.label}…`) : null,
      data && !Array.isArray(data) && data !== 'loading' ? h('p', { class: 'error' }, data.error) : null,
      Array.isArray(data) ? h('p', { class: 'muted small' }, `${matches.length} icons`) : null,
      h('div', { class: 'glyph-area' }, grid, detail),
      matches.length > iconVisible
        ? h('button', { class: 'secondary more', onclick: () => { iconVisible += ICON_PAGE; render(); } }, `Show more (${matches.length - iconVisible} left)`)
        : null,
    );
    const selected = matches.find((i) => i.name === state.iconSelected);
    if (selected) showDetail(selected, grid.querySelector('.fp-icon-cell.selected'));
    return view;
  }

  // ---------------------------------------------------------------- lazy previews

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const font = fonts.get(/** @type {HTMLElement} */ (entry.target).dataset.preview || '');
      if (font) loadPreview(font);
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '200px' });

  function observePreviews() {
    for (const el of document.querySelectorAll('[data-preview]')) observer.observe(el);
  }

  // ---------------------------------------------------------------- messages

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        defaultSample = msg.sampleText || '';
        iconSets = msg.iconSets || [];
        target = msg.target;
        for (const loaded of msg.custom) registerCustom(loaded);
        if (msg.opened) {
          const font = registerCustom(msg.opened);
          openedKey = font.key;
          state.inspect = font.key;
          state.tab = 'inspect';
          state.block = '';
          ensureLoaded(font);
        }
        // Keys of fonts that no longer exist are dropped once the catalog has loaded.
        render();
        requestCatalog();
        break;
      case 'catalog':
        registerCatalog(msg.fonts);
        catalogError = '';
        state.collection = state.collection.filter((k) => fonts.has(k));
        for (const k of state.collection) ensureLoaded(/** @type {Font} */ (fonts.get(k)));
        render();
        inspectPendingFamily();
        break;
      case 'catalogError':
        catalogError = msg.message;
        catalogRequested = false;
        render();
        break;
      case 'customAdded': {
        const font = registerCustom(msg.font);
        if (!inCollection(font.key)) state.collection.push(font.key);
        ensureLoaded(font);
        state.source = font.source === 'system' ? state.source : 'custom';
        save();
        render();
        inspectPendingFamily();
        break;
      }
      case 'response': {
        const waiting = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) waiting?.reject(new Error(msg.error));
        else waiting?.resolve(msg.result);
        break;
      }
      case 'icons':
        iconData.set(msg.set, msg.icons);
        if (state.tab === 'icons') render();
        break;
      case 'iconsError':
        iconData.set(msg.set, { error: msg.message });
        if (state.tab === 'icons') render();
        break;
      case 'target':
        target = msg.target;
        for (const el of document.querySelectorAll('.insert-bar')) el.replaceWith(insertBar(el.classList.contains('for-icons')));
        break;
      case 'systemFonts':
        systemFamilies = msg.families;
        render();
        break;
      case 'command':
        if (msg.command === 'addFile') {
          state.tab = 'fonts';
          state.source = 'custom';
          render();
          vscode.postMessage({ type: 'addFile' });
        } else if (msg.command === 'showIcons') {
          state.tab = 'icons';
          save();
          render();
        } else if (msg.command === 'inspectFamily') {
          pendingFamily = msg.family;
          inspectPendingFamily();
        }
        break;
    }
  });

  render();
  vscode.postMessage({ type: 'ready' });
})();
