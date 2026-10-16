# Changelog

## Unreleased

### New

- **Status bar button:** **Fonts** in the status bar opens the preview with one click. Hide it with
  `fontPreview.showStatusBarItem`.

## 0.3.0

### New

- 🌍 **Character tables:** sample text presets for ASCII and 30 8-bit code pages (ISO-8859-1 to -16,
  Windows-1250 to -1258, KOI8-R, KOI8-U, CP437, CP866, Mac OS Roman, Mac OS Cyrillic), one row per 16 bytes, or
  all tables at once.
- **Typography page:** starts with the sample text in the body and the heading font.

### Changed

- New README with screenshots of all tools, plus a CONTRIBUTING.md for developers.
- New icon.
- Support options: Buy Me a Coffee, GitHub Sponsors and crypto donations.

### Fixed

- Headings on the typography page were empty for sample texts that start with punctuation, and long headings
  were cut in the middle of a word.

## 0.2.0

### New

- ⭐ **Icons tab:** Font Awesome Free (Solid, Regular, Brands), Bootstrap Icons, Material Symbols (Outlined,
  Rounded, Sharp), Remix Icon, Lucide, Tabler Icons and Phosphor, with search and per-style views.
- ⚡ **Insert into code:** icons and glyphs are inserted into the last active editor at every cursor, in a format
  chosen from the file's language (HTML, JSX, CSS content, HTML entity, JS escape, character, name).
- **Multi-line sample text:** a large text box with presets on Inspect, Compare and Typography, and a text
  preview with size, weight, line height and alignment.

### Changed

- The sample text field moved from the tab bar to the tabs that use it.

## 0.1.0

First version.

- Google Fonts browser with search, category and script filters and lazy previews.
- Local font files, web font URLs, stylesheets and system fonts, each tested on load.
- Bootstrap-style typography page with separate fonts for headings, body text and code, and CSS export.
- Inspect: metadata, weights, size waterfall, variable font axes and glyph grid per Unicode block.
- Compare view for the fonts of the collection.
- Font files (`.ttf`, `.otf`, `.woff`, `.woff2`, `.ttc`) open directly in the preview.
