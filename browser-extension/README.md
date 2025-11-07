# YouTube Live Chat Downloader - Browser Extension

A browser extension that downloads YouTube live chat messages using your browser's cookies, mimicking the functionality of `yt-dlp --write-subs --sub-lang "live_chat"`.

## Features

- **Download Live Chat Replay**: Download archived chat from finished live streams
- **Download Live Chat**: Download chat messages from ongoing live streams (continues until stopped)
- **Browser Cookie Integration**: Automatically uses your browser's YouTube cookies for authentication (no need to export cookie files)
- **yt-dlp Compatible**: Follows the same implementation logic as yt-dlp's `YoutubeLiveChatFD` downloader
- **Same Output Format**: Generates `.live_chat.json` files in the same format as yt-dlp

## Implementation Details

This extension closely mimics the implementation of yt-dlp's live chat downloader:

### Architecture

1. **Content Script** (`content.js`): Runs on YouTube pages, extracts page data, and handles the download logic
2. **Background Script** (`background.js`): Manages state and coordinates file downloads
3. **Popup UI** (`popup.html`, `popup.js`): Provides user interface for controlling downloads

### Key Features Mimicked from yt-dlp

- **ytcfg Extraction**: Extracts YouTube configuration including `INNERTUBE_API_KEY` and `INNERTUBE_CONTEXT`
- **Initial Data Parsing**: Reads `ytInitialData` to detect live chat availability
- **SAPISIDHASH Generation**: Generates authorization headers using SAPISID cookies (for logged-in users)
- **API Headers**: Generates proper YouTube API headers including:
  - `X-YouTube-Client-Name`
  - `X-YouTube-Client-Version`
  - `X-Goog-Visitor-Id`
  - `Authorization` (SAPISIDHASH)
- **Continuation Parsing**: Handles both replay and live chat continuation data
- **Action Parsing**: Parses chat actions in the same format as yt-dlp:
  - `parseActionsReplay()` - mirrors `parse_actions_replay()` from yt-dlp
  - `parseActionsLive()` - mirrors `parse_actions_live()` from yt-dlp
  - `parseLiveTimestamp()` - mirrors `parse_live_timestamp()` from yt-dlp
- **Fragment Download**: Downloads chat in fragments/chunks using continuation tokens
- **Output Format**: Generates newline-delimited JSON matching yt-dlp's format

### Compared to yt-dlp Command

```bash
# yt-dlp command
yt-dlp --cookies www.youtube.com_cookies.txt --skip-download --write-subs --sub-lang "live_chat" https://www.youtube.com/watch?v=VIDEO_ID

# This extension
# 1. Navigate to https://www.youtube.com/watch?v=VIDEO_ID
# 2. Click extension icon
# 3. Click "Download Live Chat (Replay)"
# Result: VIDEO_ID.live_chat.json file downloaded
```

## Installation

### Chrome/Edge (Chromium-based browsers)

1. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `browser-extension` directory from this repository

### Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Navigate to the `browser-extension` directory
4. Select the `manifest.json` file

## Usage

1. **Navigate to a YouTube video** with live chat (either live or replay available)
2. **Click the extension icon** in your browser toolbar
3. **Choose download type**:
   - **Download Live Chat (Replay)**: For finished live streams with archived chat
   - **Download Live Chat (Live)**: For ongoing live streams (runs until stopped)
4. **Save the file** when prompted

The extension will download the chat and save it as `VIDEO_ID.live_chat.json` in the same format as yt-dlp.

## Output Format

The output file format is identical to yt-dlp's live chat format:
- Newline-delimited JSON
- Each line contains a chat action object
- Compatible with yt-dlp's post-processors and parsers

Example:
```json
{"replayChatItemAction":{"actions":[{"addChatItemAction":{"item":{"liveChatTextMessageRenderer":{...}}}}]},"videoOffsetTimeMsec":"123456","isLive":false}
{"replayChatItemAction":{"actions":[{"addChatItemAction":{"item":{"liveChatTextMessageRenderer":{...}}}}]},"videoOffsetTimeMsec":"123789","isLive":false}
...
```

## Technical Requirements

- Chromium-based browser (Chrome, Edge, Brave, Opera, Vivaldi) or Firefox
- Manifest V3 support
- YouTube cookies (automatically handled by the browser)

## Permissions

The extension requires the following permissions:

- `cookies`: To access YouTube cookies for authentication
- `activeTab`: To interact with the current YouTube tab
- `scripting`: To inject content scripts
- `downloads`: To save the chat file
- `https://www.youtube.com/*`: To access YouTube pages

## Code Structure

```
browser-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic and UI handling
├── background.js         # Service worker for managing state
├── content.js            # Core download logic (mimics yt-dlp)
└── README.md             # This file
```

## Comparison with yt-dlp

| Feature | yt-dlp | This Extension |
|---------|--------|----------------|
| Cookie handling | File-based (`--cookies`) | Browser cookies (automatic) |
| Live chat replay | ✅ | ✅ |
| Live chat (live) | ✅ | ✅ |
| Output format | `.live_chat.json` | `.live_chat.json` (identical) |
| SAPISIDHASH auth | ✅ | ✅ |
| Continuation parsing | ✅ | ✅ |
| API compatibility | ✅ | ✅ |
| Platform | CLI (Python) | Browser extension (JavaScript) |

## Troubleshooting

### "No live chat available for this video"
- The video must have live chat enabled
- For replays, the stream must be finished
- Some videos don't have chat (disabled by uploader)

### "Failed to extract YouTube configuration"
- Try refreshing the YouTube page
- Make sure you're on a video page (`/watch?v=...`)
- Check browser console for detailed errors

### "YouTube API request failed"
- Your cookies might have expired - try reloading YouTube
- Network issues - check your connection
- YouTube might have rate-limited requests

## Development

Based on yt-dlp's implementation:
- Python source: `yt_dlp/downloader/youtube_live_chat.py`
- YouTube extractor: `yt_dlp/extractor/youtube/`

## License

This extension follows the same license as the yt-dlp project.

## Credits

- Implementation logic based on [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Specifically mimics `YoutubeLiveChatFD` from `yt_dlp/downloader/youtube_live_chat.py`
