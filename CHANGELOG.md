# Changelog

## Unreleased

### Fixed

- The extension id is `bsesic.vscode-font-preview` again, so the Marketplace item published with 0.4.0 is
  updated instead of a new item being created. The display name stays **Font Studio**.

## 0.4.2

### Changed

- Renamed to **Font Studio**, because the name Font Preview is already taken on the Visual Studio Marketplace.
  The extension id is now `bsesic.vscode-font-studio`; command and setting ids (`fontPreview.*`) are unchanged.

## 0.4.1

### Changed

- The extension is called **Font Preview** in VS Code and on the Marketplace; `VSCodeFontPreview` is the name
  of the repository.

## 0.4.0

### New

- 🌍 **14 languages:** the user interface follows the VS Code display language and is available in English,
  German, French, Spanish, Italian, Portuguese (Brazil), Japanese, Korean, Chinese (Simplified and Traditional),
  Russian, Polish, Czech and Turkish.
- 🧪 **OpenType features:** toggle ligatures, small caps, figure styles, fractions, stylistic sets, kerning and
  more on the sample text in Inspect. Font files show the features they contain; copy or insert the
  `font-feature-settings` CSS. New *OpenType test* sample text preset.
- ⌨️ **Keyboard shortcut and context menus:** `Ctrl+Alt+Shift+F` / `Cmd+Alt+Shift+F` opens the preview. The
  editor context menu has **Preview Font Under Cursor** (reads `font-family`, `font` and `fontFamily`, else
  the quoted string or word at the cursor) and **Insert Icon…**.
- 📦 **Add to project:** download the WOFF2 files of a font (chosen weights, styles and scripts) into the
  workspace, with a stylesheet of `@font-face` rules and `unicode-range`, and insert its `@import`. Works for
  Google Fonts, Fontsource fonts, font files and web font URLs. Setting: `fontPreview.projectFontFolder`.
- **Insert CSS:** the generated CSS can be inserted into the editor, not only copied.
- 🔍 **Complete font details for Google Fonts:** exact glyph coverage, all variable axes, names, version,
  designer, license and OpenType features, read from the complete font file (only the needed tables are
  downloaded). Feature tests use the complete file, because the files Google serves to browsers lack many
  optional features.
- **System fonts on every platform:** without fontconfig (Windows, macOS), installed fonts are listed by
  reading the family names from the system and user font folders.
- **WOFF2 collections:** font files with several fonts are read (the details show the first font and the
  number of fonts).
- **Status bar button:** **Fonts** in the status bar opens the preview with one click. Hide it with
  `fontPreview.showStatusBarItem`.

### Fixed

- **Add Font File…** from the command palette did nothing when the panel was not open yet; commands now wait
  until the panel has started.
- Font details of fonts from the *Other open fonts (Fontsource)* source failed, because jsDelivr answers
  range requests over HTTP/1.1 with an empty response; the whole file is downloaded instead.
- Fonts with several Fontsource subsets register every subset with its `unicode-range`.

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
