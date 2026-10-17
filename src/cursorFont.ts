// Finds the font family a user means when running "Preview Font Under Cursor".

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert',
  'revert-layer', '-apple-system', 'blinkmacsystemfont',
]);

/** Cuts a value at a quote that has no partner, e.g. the end of an HTML style attribute. */
function trimUnbalanced(value: string): string {
  for (const quote of ['"', "'"]) {
    if (value.split(quote).length % 2 === 0) {
      value = value.slice(0, value.lastIndexOf(quote));
    }
  }
  return value;
}

/** Font families of a CSS font-family value, without quotes, generic families and var(). */
export function parseFamilies(value: string): string[] {
  const families: string[] = [];
  for (const part of trimUnbalanced(value).split(',')) {
    const name = part.trim().replace(/^["'`]|["'`]$/g, '').replace(/\s*!important$/, '').trim();
    if (name && !GENERIC.has(name.toLowerCase()) && !/^var\(/i.test(name) && !/[{}();]/.test(name)) {
      families.push(name);
    }
  }
  return families;
}

// font-family: …;  font: 700 1rem/1.2 "Inter", sans-serif;  fontFamily: "'Inter', sans-serif"  family: 'Inter'
const DECLARATIONS = [
  /font-family\s*:\s*([^;{}<>]+)/gi,
  /fontFamily\s*[:=]\s*(?:\{?\s*)(["'`])(.+?)\1/g,
  /\bfont\s*:\s*[^;{}<>]*?\d[^;{}<>"',]*\s+([^;{}<>]+)/gi,
];

/**
 * The first font family on `line` around `column`: from a font-family/fontFamily/font
 * declaration, else the quoted string or word at the cursor.
 */
export function familyAtCursor(line: string, column: number): string | undefined {
  for (const pattern of DECLARATIONS) {
    for (const match of line.matchAll(pattern)) {
      const start = match.index ?? 0;
      const value = match[2] ?? match[1];
      // With several declarations on a line, prefer the one the cursor is in.
      const contains = column >= start && column <= start + match[0].length;
      const families = parseFamilies(value);
      if (families.length && (contains || !line.slice(start + match[0].length).match(pattern))) {
        return families[0];
      }
    }
  }
  const quoted = /(["'`])([^"'`]+)\1/g;
  for (const match of line.matchAll(quoted)) {
    const start = match.index ?? 0;
    if (column >= start && column <= start + match[0].length) {
      return parseFamilies(match[2])[0];
    }
  }
  const word = /[A-Za-z][\w-]*/g;
  for (const match of line.matchAll(word)) {
    const start = match.index ?? 0;
    if (column >= start && column <= start + match[0].length) {
      return parseFamilies(match[0])[0];
    }
  }
  return undefined;
}
