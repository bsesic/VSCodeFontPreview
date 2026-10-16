// Collects the English texts of the extension into l10n/bundle.l10n.json:
// t('…') and N('…') in the webview script, vscode.l10n.t('…') in the extension host.
// Usage: node scripts/extract-l10n.js [--check]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'l10n', 'bundle.l10n.json');

const STRING = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\])*)\1`;
const WEBVIEW_CALL = new RegExp(String.raw`(?<![\w.$])[tN]\(\s*` + STRING, 'g');
const HOST_CALL = new RegExp(String.raw`vscode\.l10n\.t\(\s*` + STRING, 'g');

/** Unescapes the body of a JavaScript string literal (no template expressions). */
function unescape(body) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, esc) => {
    if (esc[0] === 'u') return String.fromCodePoint(parseInt(esc.replace(/[u{}]/g, ''), 16));
    if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r' }[esc] ?? esc;
  });
}

function filesIn(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full, ext) : full.endsWith(ext) ? [full] : [];
  });
}

/** All texts in the order they appear, without duplicates. */
function extract(root = ROOT) {
  const sources = [
    [path.join(root, 'media', 'main.js'), WEBVIEW_CALL],
    ...filesIn(path.join(root, 'src'), '.ts').map((file) => [file, HOST_CALL]),
  ];
  const texts = new Set();
  for (const [file, pattern] of sources) {
    const code = fs.readFileSync(file, 'utf8');
    for (const match of code.matchAll(pattern)) {
      if (match[1] === '`' && match[2].includes('${')) {
        throw new Error(`${path.relative(root, file)}: translated template literal with an expression: ${match[0]}`);
      }
      texts.add(unescape(match[2]));
    }
  }
  return [...texts];
}

function template(texts) {
  return `${JSON.stringify(Object.fromEntries(texts.map((text) => [text, text])), null, 2)}\n`;
}

if (require.main === module) {
  const content = template(extract());
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(TEMPLATE) ? fs.readFileSync(TEMPLATE, 'utf8') : '';
    if (current !== content) {
      console.error('l10n/bundle.l10n.json is outdated. Run npm run l10n.');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(TEMPLATE, content);
    console.log(`${Object.keys(JSON.parse(content)).length} texts written to l10n/bundle.l10n.json`);
  }
}

module.exports = { extract, template, TEMPLATE };
