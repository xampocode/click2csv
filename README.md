# CLICK2CSV Extension Specs

## Overview
CLICK2CSV is a Chrome Extension that opens CSV files in a dedicated viewer with tools for loading, inspecting, editing, and exporting tabular data. The viewer can be launched from the browser action, via context menus on links or pages, or directly by visiting the bundled `viewer.html`.

## Key Features
- **CSV ingestion**: Load files from disk, supply a URL, or drag & drop files/links onto the viewer.
- **Delimiter handling**: Auto-detects delimiter with manual override for comma, semicolon, tab, or pipe.
- **Header support**: Toggle header-row detection; auto-generates column names when headers are absent.
- **Column operations**: Freeze leading columns, reorder via drag & drop, resize with draggable handles, and sort ascending/descending per column.
- **Virtualized table**: Efficiently renders large datasets with spacer rows and sticky headers/frozen cells.
- **Search filter**: Live text filter scans visible columns respecting the current column order.
- **Edit mode**: Optional inline editing for cell contents; edits persist in memory for export.
- **Exports**: Download the current view as CSV (respecting delimiter), JSON, or Excel-compatible XML.
- **Theme control**: Light/dark themes with manual toggle, system preference detection, and persistence via `chrome.storage`.
- **State persistence**: Remembers theme, freeze count, and column ordering between sessions.
- **Reset flow**: Reset button clears stored preferences and reloads with a confirmation flash message.
- **Context menus**: Background service worker adds "Open in CSV Viewer" (links) and "Open page as CSV in Viewer" (pages).
- **Version + branding**: Toolbar displays extension version (read from manifest) and a link to `www.4s.lu`.

## File Layout
```
viewer.html   # UI shell, inline styling, toolbar markup
viewer.js     # Viewer logic: parsing, rendering, events
background.js # Service worker registering context menus
manifest.json # Chrome MV3 manifest defining permissions and assets
icons/        # Extension icons (16, 48, 128, 512)
```

## Styling Notes
- Light theme defaults to white surfaces with slate text; dark theme uses Apple-inspired graphite tones (`#1c1c1e` header/chips, `#0b0f14` background).
- Sticky header uses `backdrop-filter: blur(12px)` for a translucent chrome effect.
- Toolbar aligns controls, status message, version badge, and brand link on a single row.

## Storage Keys
- `csv_viewer_theme` – persisted theme override (`"light"`/`"dark"`).
- `csv_viewer_freeze` – number of frozen columns.
- `csv_viewer_colOrder` – array of column indexes representing the current order.

## Build & Load
1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `click2csv` folder.
4. The extension icon opens the viewer; context menus appear after installation.

## Usage Tips
- Reparse button re-runs parsing for the current dataset after changing delimiter/header options.
- Edit mode should be toggled off when not editing to avoid accidental changes.
- Reset clears preferences and reloads with a confirmation message (`flash=reset-ok`).
- Export menu remembers the last chosen format within the session.

## Future Enhancements (Ideas)
- Persist column widths alongside order and freeze count.
- Support multi-sheet exports or XLSX via library integration.
- Provide keyboard shortcuts for navigation, editing, and export.
- Add validation/preview for JSON/XML exports before download.

## Chrome Web Store Deployment
1. Update `manifest.json` with a new semantic `version` prior to packaging (current release: `1.0.0`).
2. Run `zip -r dist/CLICK2CSV-<version>.zip manifest.json background.js viewer.html viewer.js icons` from the project root to generate the upload bundle. A ready-made archive lives at `dist/CLICK2CSV-1.0.0.zip`.
3. In the Chrome Web Store Developer Dashboard, create or update the item and upload the generated ZIP.
4. Fill in the listing details (description, screenshots, icon) and submit for review.
