# Auto Apply Mercado Livre Coupons

## Overview
This Chrome (Manifest V3) extension automates applying Mercado Livre coupons. After you click **Start** in the popup, it clicks every **“Aplicar”** button on the current coupons page and paginates with **“Seguinte”** until no further pages exist. The process can be stopped at any time from the popup.

## Architecture
- **Popup**: Simple Start/Stop control; persists the running flag in `chrome.storage.local`.
- **Service worker**: Receives popup commands, updates the running flag, and notifies the active tab.
- **Content script**: Executes the click-and-paginate loop on coupon pages, honoring the running flag across navigations.
- **Host scope**: Limited to `https://*.mercadolivre.com.br/cupons/*`.

## Components
- `manifest.json`: MV3 config, permissions, matches, and entry points.
- `src/popup.html` / `src/popup.js`: UI to toggle automation and show status.
- `src/service_worker.js`: Message hub between popup and content script; re-triggers automation after navigation while running.
- `src/content_script.js`: Finds “Aplicar” buttons, clicks them with delays and jitter, then clicks “Seguinte” until it disappears.

## Style
- Minimal inline styling in the popup for clarity and readability.
- JavaScript kept small and event-driven; no external dependencies.
- Text and comments in English; UI labels remain aligned with the Mercado Livre interface terms.

## Testing
- Manual: Load the unpacked extension, open `https://www.mercadolivre.com.br/cupons/filter?all=true&page=1`, click **Start** in the popup, and observe auto-application and pagination until the end.
- Verify **Stop** halts immediately (no further clicks or navigation).
- Reopen the page to confirm automation resumes when `running=true` in storage.

## Deployment
- In Chrome, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this project folder.
- Ensure the matches/host permissions remain restricted to Mercado Livre coupons paths.

## Maintenance
- If Mercado Livre changes button labels or pagination selectors, update the selectors in `src/content_script.js`.
- Adjust delay constants in `src/content_script.js` to tune pacing if throttling is observed.
- Keep permissions minimal; avoid broad host patterns.

## Conclusion
The extension provides a controlled Start/Stop automation loop for Mercado Livre coupon pages, persisting across navigation and staying within a narrow host scope for safety.
