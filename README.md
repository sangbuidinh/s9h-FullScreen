# Tab Fullscreen

Tab Fullscreen is a lightweight Chrome Extension that makes videos fullscreen inside the current browser tab.

Instead of using the browser's native fullscreen mode, this extension keeps the video enlarged within the active tab. This allows you to keep using other tabs, windows, and monitors normally.

## Features

- Fullscreen-style video inside the current tab
- Does not take over the entire desktop screen
- Works with video players inside pages and iframes
- Simple enable/disable popup
- Press `Esc` to exit tab fullscreen mode
- Saves extension settings locally using Chrome storage

## Use Cases

This extension is useful when you want to:

- Watch videos in a larger view without entering system fullscreen
- Switch to other browser tabs while keeping the video page usable
- Use multiple windows or monitors while watching video
- Avoid native fullscreen behavior that blocks normal multitasking

## Installation

1. Download or clone this repository.
2. Open Chrome or another Chromium-based browser.
3. Go to:

```text
chrome://extensions/
```

4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select this project folder.
7. The extension icon should appear in the browser toolbar.

## How to Use

1. Open a website with a video player.
2. Click the fullscreen button in the video player.
3. The video will expand inside the current tab.
4. Press `Esc` or use the player's exit fullscreen button to return to normal view.
5. Use the extension popup to enable or disable the feature.

## Project Structure

```text
s9h-FullScreen/
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── content.js
├── inject.css
├── inject.js
├── manifest.json
├── popup.html
├── popup.js
└── README.md
```

## Main Files

| File | Description |
|---|---|
| `manifest.json` | Chrome Extension configuration |
| `content.js` | Loads extension settings and communicates with the page |
| `inject.js` | Handles fullscreen behavior inside the tab |
| `inject.css` | Styles used for tab-level fullscreen display |
| `popup.html` | Extension popup interface |
| `popup.js` | Popup logic and toggle handling |
| `icons/` | Extension icons |

## Permissions

This extension uses the following permission:

```json
"permissions": ["storage"]
```

The `storage` permission is used only to save the extension's enabled/disabled state locally in the browser.

## Privacy

This extension does not collect, store, or send personal data to any external server.

All settings are stored locally in the browser.

## Browser Support

Designed for Chromium-based browsers, including:

- Google Chrome
- Microsoft Edge
- Brave
- Other Chromium-based browsers that support Manifest V3

## Development

After editing the extension files:

1. Open:

```text
chrome://extensions/
```

2. Click **Reload** on the extension.
3. Refresh the target website to test the latest version.

## Notes

Some websites use custom video players, nested iframes, or strict fullscreen restrictions. Behavior may vary depending on how each website implements its video player.

## License

No license specified yet.
