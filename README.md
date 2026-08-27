# YouTube Subtitle Downloader — Current Captions to TXT

Download exactly the subtitle language currently displayed by YouTube as timestamped UTF-8 TXT.

Supports manual captions, auto-generated captions, and available automatic translations. No server, no tracking, and no third-party API.

Unlike a general YouTube transcript downloader, this userscript does not guess a language or default to the first available track. The downloaded language always follows the captions currently visible in the player.

## Features

- Downloads only the subtitle language currently displayed by YouTube.
- Disables the download button immediately when captions are unavailable or CC is turned off.
- Responds to caption language changes, CC toggles, and YouTube SPA navigation.
- Supports manual captions, automatically generated captions, and currently displayed automatic translations when their authenticated request is available.
- Exports timestamped UTF-8 plain text without translation, summarization, or rewriting.
- Includes AI-friendly metadata: document type, video title, channel, URL, video ID, subtitle language, subtitle type, and download time.
- Uses a sanitized, length-limited filename containing the video title, language code, and video ID.
- Has no dependencies, server, third-party API, analytics, or tracking.

## Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).
2. [Install the userscript](https://raw.githubusercontent.com/johnnychendev/youtube-current-subtitle-downloader/main/youtube-current-subtitle-downloader.user.js).
3. Confirm the installation in your userscript manager.

The raw installation link will work after this repository is published on GitHub with the `main` branch.

## Usage

1. Open a YouTube video.
2. Turn on subtitles with the native **CC** button.
3. Select the desired subtitle language in YouTube's native settings if needed.
4. Click the **CC + download arrow** button in the player controls.

The script downloads the subtitle currently displayed by YouTube. If no captions are visible, the button is disabled.

## TXT format

Each file starts with metadata followed by timestamped subtitle lines:

```text
Document-Type: YouTube Subtitle Transcript
Video-Title: Example title
Channel: Example channel
URL: https://www.youtube.com/watch?v=example
Video-ID: example
Subtitle-Language: en (English)
Subtitle-Type: Manual
Downloaded-At: 2026-08-27T12:00:00.000Z

[00:00:03] First subtitle line.
[00:00:07] Second subtitle line.
```

## Permissions and privacy

The script uses only:

- `@match https://www.youtube.com/*` — required for YouTube video pages and SPA navigation from the YouTube homepage.
- `@grant none` — no privileged userscript APIs are requested.

All processing happens locally in the browser. The script makes no analytics, tracking, or third-party requests. A complete subtitle response is fetched only after the user clicks the download button.

## Performance design

- Event-driven updates instead of high-frequency polling.
- No full-page `MutationObserver`.
- No continuous subtitle DOM parsing.
- A lightweight `PerformanceObserver` filters resource names before URL parsing and retains only a small number of relevant caption URLs.
- Player listeners are registered once per player instance.
- Complete subtitle data is downloaded and parsed only on demand.

## Compatibility notes

The script relies on YouTube's current player behavior and may require maintenance when YouTube changes its internal caption implementation. Automatic translations can be downloaded only when the currently displayed translated caption request can be identified reliably.

Browser download settings, extension permissions, private browsing restrictions, and YouTube experiments can also affect behavior.

## Development

This project has no build step or dependencies.

Run a syntax check with:

```bash
node --check youtube-current-subtitle-downloader.user.js
```

Browser verification should cover:

- Manual captions.
- Automatically generated captions.
- Automatic translation.
- CC on/off state changes.
- Subtitle language changes.
- Navigation from the YouTube homepage to a video.
- SPA navigation between videos.
- Standard videos and Shorts.

## License

[MIT](LICENSE)

Created by [Johnny Chen](https://github.com/johnnychendev), founder of [CheckoutWorks](https://checkoutworks.dev/).

YouTube is a trademark of Google LLC. This project is not affiliated with or endorsed by YouTube or Google.
