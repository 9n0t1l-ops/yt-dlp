# YouTube Tools - Browser Extension

A browser extension that provides YouTube utilities using your browser's cookies, mimicking yt-dlp functionality.

## Features

### Live Chat Downloader

- **Download Live Chat Replay**: Download archived chat from finished live streams
- **Download Live Chat**: Download chat messages from ongoing live streams (continues until stopped)
- **Browser Cookie Integration**: Automatically uses your browser's YouTube cookies for authentication (no need to export cookie files)
- **yt-dlp Compatible**: Follows the same implementation logic as yt-dlp's `YoutubeLiveChatFD` downloader
- **Same Output Format**: Generates `.live_chat.json` files in the same format as yt-dlp

### Channel Live Stream Fetcher (NEW)

- **Fetch All Live Videos**: Get all live, upcoming, and archived live stream videos from a YouTube channel
- **Video Status Detection**: Automatically identifies videos that are currently live, upcoming, or past live streams
- **Statistics**: Shows counts for live, upcoming, and past live streams
- **Export Options**: Copy all video IDs or export complete data as JSON
- **Quick Access**: Click video titles to open them in new tabs

## Implementation Details

This extension closely mimics the implementation of yt-dlp's live chat downloader:

### Architecture

1. **Content Script** (`content.js`): Runs on video watch pages, extracts page data, and handles the live chat download logic
2. **Background Script** (`background.js`): Manages state and coordinates file downloads
3. **Popup UI** (`popup.html`, `popup.js`): Provides user interface with tabs for live chat downloading and channel live stream listing
4. **Channel Content Script** (`channel-content.js`): Runs on channel pages (`/@handle`), fetches live stream metadata using logged-in cookies

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

### Live Chat Downloader

1. **Navigate to a YouTube video** with live chat (either live or replay available)
2. **Click the extension icon** in your browser toolbar
3. **Choose download type**:
   - **Download Live Chat (Replay)**: For finished live streams with archived chat
   - **Download Live Chat (Live)**: For ongoing live streams (runs until stopped)
4. **Save the file** when prompted

The extension will download the chat and save it as `VIDEO_ID.live_chat.json` in the same format as yt-dlp.

### Channel Live Stream Fetcher

1. **Navigate to a YouTube channel page** (e.g., `https://www.youtube.com/@channelname`)
2. **Click the extension icon** in your browser toolbar - it will automatically switch to the "Channel Live Streams" tab
3. **Click "Fetch All Live Videos"** to retrieve the list
4. **Use the results**:
   - Click on video titles to open them in new tabs
   - Click "Copy" next to any video ID to copy it
   - Click "Copy All Video IDs" to copy all IDs (one per line)
   - Click "Export as JSON" to download complete metadata

For detailed Chinese documentation, see [README-CHANNEL-LIVES-ZH.md](README-CHANNEL-LIVES-ZH.md).

## Output Formats

### Live Chat Downloader

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

### Channel Live Stream Fetcher

Two output options are available:

- **Copy All Video IDs**: Plain text with one video ID per line (suitable for piping into yt-dlp)
- **Export as JSON**: Structured JSON containing channel metadata, per-video details, and aggregate statistics

Example JSON export:
```json
{
  "channel": {
    "id": "CHANNEL_ID",
    "title": "Channel Name",
    "description": "...",
    "url": "https://www.youtube.com/channel/CHANNEL_ID",
    "subscriberCountText": "1.23M subscribers"
  },
  "videos": [
    {
      "videoId": "VIDEO_ID",
      "title": "Live Stream Title",
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "isLive": true,
      "isUpcoming": false,
      "viewCountText": "123K views",
      "publishedTimeText": "Streamed 2 days ago",
      "scheduledStartTime": "2024-01-01T12:00:00.000Z",
      "thumbnails": [...]
    }
  ],
  "totalCount": 10,
  "liveCount": 2,
  "upcomingCount": 1,
  "exportedAt": "2024-01-05T08:30:00.000Z"
}
```

## Technical Requirements

- Chromium-based browser (Chrome, Edge, Brave, Opera, Vivaldi) or Firefox
- Manifest V3 support
- YouTube cookies (automatically handled by the browser)

## Permissions

The extension requires the following permissions:

- `activeTab`: To interact with the current YouTube tab
- `downloads`: To save chat files and JSON exports
- `https://www.youtube.com/*`: To access YouTube pages and extract data

## Code Structure

```
browser-extension/
├── manifest.json            # Extension manifest (Manifest V3)
├── popup.html              # Extension popup UI with tabbed tools
├── popup.js                # Popup logic for live chat + channel live streams
├── background.js           # Service worker for managing downloads
├── content.js              # Live chat download logic (mimics yt-dlp)
├── channel-content.js      # Channel page logic for fetching live streams
├── README.md               # English documentation (this file)
└── README-CHANNEL-LIVES-ZH.md # Chinese documentation focused on live stream IDs
```

## Comparison with yt-dlp

| Feature | yt-dlp | This Extension |
|---------|--------|----------------|
| Cookie handling | File-based (`--cookies`) | Browser cookies (automatic) |
| Live chat replay | ✅ | ✅ |
| Live chat (live) | ✅ | ✅ |
| Live chat output format | `.live_chat.json` | `.live_chat.json` (identical) |
| Channel live stream listing | Manual scripting required | ✅ Built-in UI |
| SAPISIDHASH auth | ✅ | ✅ |
| Continuation parsing | ✅ | ✅ |
| API compatibility | ✅ | ✅ |
| Platform | CLI (Python) | Browser extension (JavaScript) |

## Troubleshooting

### Live Chat Downloader

#### "No live chat available for this video"
- The video must have live chat enabled
- For replays, the stream must be finished
- Some videos don't have chat (disabled by uploader)

#### "Failed to extract YouTube configuration"
- Try refreshing the YouTube page
- Make sure you're on a video page (`/watch?v=...`)
- Check browser console for detailed errors

#### "YouTube API request failed"
- Your cookies might have expired - try reloading YouTube
- Network issues - check your connection
- YouTube might have rate-limited requests

### Channel Live Stream Fetcher

#### "Navigate to a YouTube channel page"
- Ensure you are on a channel page with URL format: `https://www.youtube.com/@channelname`
- Don't use video watch pages or other YouTube pages

#### "Failed to fetch streams page"
- Check your network connection
- Make sure you are logged into YouTube
- Try refreshing the page and clicking the extension again

#### "Unable to extract channel data"
- YouTube page structure may have changed
- Try refreshing the page
- Check browser console for detailed errors

#### "No live videos found"
- The channel may not have any live stream videos
- Ensure the channel has created live streams (past, upcoming, or current)
- Some channels may restrict access to their live stream lists

## Development

Based on yt-dlp's implementation:
- Python source: `yt_dlp/downloader/youtube_live_chat.py`
- YouTube extractor: `yt_dlp/extractor/youtube/`

## License

This extension follows the same license as the yt-dlp project.

## Credits

- Implementation logic based on [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Specifically mimics `YoutubeLiveChatFD` from `yt_dlp/downloader/youtube_live_chat.py`
