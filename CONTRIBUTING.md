# Contributing to VSCodeFontPreview

Thanks for your interest in improving VSCodeFontPreview! Bug reports, feature ideas and pull requests are
welcome.

- 🐞 **Bugs and ideas:** open an issue on [GitHub](https://github.com/bsesic/VSCodeFontPreview/issues).
- 🔧 **Code:** fork the repository, create a branch and open a pull request against `development`.

## Development setup

The tooling (`node --test`, `vsce`, typescript-eslint) requires **Node.js 20** or newer (see `.nvmrc`).

```bash
nvm use                                  # Node.js 20 from .nvmrc
npm install
git config core.hooksPath .githooks      # enable the pre-commit hook (once)
```

Press `F5` in VS Code to start an Extension Development Host with the extension loaded.

### Scripts

| Command | Description |
| --- | --- |
| `npm run compile` | Build the extension host (`out/`) |
| `npm run watch` | Rebuild the extension host on changes |
| `npm run lint` | Run ESLint on `src/`, `test/`, `media/` and `scripts/` |
| `npm run l10n` | Update the English localization template `l10n/bundle.l10n.json` |
| `npm test` | Compile and run the unit tests (`node --test`) |
| `npm run package` | Create the `.vsix` package |
| `npm run build` | Compile, run the tests and create the `.vsix` package |

The pre-commit hook in `.githooks/` runs ESLint and the unit tests before every commit and switches to the
Node.js version from `.nvmrc` via nvm automatically.

## Project structure

| Path | Content |
| --- | --- |
| `src/extension.ts` | Activation, commands and the custom editor for font files |
| `src/webview.ts` | Webview HTML with Content Security Policy and the messages between webview and extension |
| `src/sources.ts` | Font catalog, custom fonts (files, URLs, stylesheets, system fonts) and their persistence |
| `src/fontInfo.ts` | Side-effect free reader for TTF, OTF, TTC, WOFF and WOFF2: names, cmap coverage, variable axes |
| `src/iconSets.ts` | Icon set definitions and the parsers for their metadata |
| `src/editorTarget.ts` | Remembers the last text editor and inserts icons and glyphs into it |
| `src/fontDetails.ts` | Complete font details of Google Fonts via the download manifest and HTTP range requests; Fontsource faces |
| `src/systemFonts.ts` | Installed fonts from the font folders of Windows, macOS and Linux |
| `src/projectFonts.ts` | *Add to project*: downloads font files into the workspace and writes the stylesheet |
| `src/cursorFont.ts` | Finds the font family under the cursor |
| `media/` | Webview UI (`main.js`, plain DOM without framework) and styles (`main.css`) |
| `l10n/`, `package.nls*.json` | Translations |
| `scripts/` | Build helper scripts (localization template) |
| `test/` | Unit tests, a stub of the `vscode` API (`vscodeStub.ts`) and font fixtures |
| `images/` | Icon source (`icon.svg`), rendered icon and README screenshots |

New parsing logic belongs in a side-effect free module and should come with unit tests.

The webview follows the VS Code theme through its CSS variables. Icon set stylesheets style elements by class
prefix (Lucide, for example, styles every `[class^="icon-"]`), so the classes of the UI itself use the `fp-`
prefix where they could collide.

## Localization

The extension follows the VS Code display language. All user-visible texts are English in the code and are
translated via bundles:

| File | Content |
| --- | --- |
| `package.nls.json`, `package.nls.<lang>.json` | Commands, settings and the description (`%key%` in `package.json`) |
| `l10n/bundle.l10n.json` | English template of all texts of the extension host and the webview (generated) |
| `l10n/bundle.l10n.<lang>.json` | Translations, keyed by the English text |

Supported languages: `de`, `fr`, `es`, `it`, `pt-br`, `ja`, `ko`, `zh-cn`, `zh-tw`, `ru`, `pl`, `cs`, `tr`.

The extension host passes the bundle of the display language to the webview with the initial data.

When you add or change a text:

1. Wrap it in `t('…')` in the webview (`media/main.js`) or `vscode.l10n.t('…')` in the extension host. Use
   placeholders for values: `t('{0} fonts', count)`. Never build sentences from fragments. For texts in constant
   tables, mark them with `N('…')` and translate them with `t()` where they are shown. A part in `<…>` (as in
   `t('Insert into <{0}>', name)`) can be wrapped in an element with `withMarkup()`.
2. Run `npm run l10n` to update `l10n/bundle.l10n.json`.
3. Add the translation to every `l10n/bundle.l10n.<lang>.json`.

`npm test` fails if the template is outdated or a language misses a text or uses different placeholders.

Generated code (CSS snippets, stylesheet comments) and the sample texts stay English.

## Adding an icon set

Icon sets are defined in `ICON_SETS` in `src/iconSets.ts`:

1. Pin the package version and add the stylesheet URL(s), the CSS font family and weight of each style and an
   HTML template with `{name}`.
2. Choose the source of the icon names: `css` (rules like `.prefix-name::before { content: "\f101" }`),
   `fontawesome` (`icon-families.json`) or `codepoints` (`name hex` per line).
3. Check in the **Icons** tab that the icons render and that the inserted HTML works.

## Workflow

- `main` holds the releases and is used for deployment.
- `development` is the integration branch for ongoing work.
- Create a `feature/*` branch for features, a `bugfix/*` branch for bug fixes and a `chore/*` branch for
  everything else, then open a pull request against `development`.
- Reference the related issue in commits and pull requests (`Refs #12`, `Closes #12`).
- Code, comments, UI texts, commit messages and pull requests are written in English.

## Icon

The icon has a single source: `images/icon.svg`. After editing it, export it as a 256 × 256 PNG to
`images/icon.png`, which is used as marketplace icon, for example:

```bash
inkscape images/icon.svg --export-type=png --export-filename=images/icon.png -w 256 -h 256
```

## Screenshots

README screenshots live in `images/screenshots/`. Crop them to the relevant part of the preview and make sure
they do not show private paths, project names or other extensions.

## Releasing

1. Update the version in `package.json` and the `CHANGELOG.md`.
2. Merge `development` into `main` via pull request.
3. Tag the release (`git tag -a vX.Y.Z`) and create a GitHub release with the `.vsix` attached.
4. Publish to the marketplace:

   ```bash
   npm run package                 # creates vscode-font-preview-<version>.vsix
   npx vsce login bsesic           # once, with an Azure DevOps personal access token
   npx vsce publish
   ```
