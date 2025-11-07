# Usage Guide: YouTube Live Chat Downloader Extension

## Quick Start

### 1. Install the Extension

**Chrome/Edge/Brave:**
```bash
1. Go to chrome://extensions/ (or edge://extensions/)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the browser-extension folder
```

**Firefox:**
```bash
1. Go to about:debugging#/runtime/this-firefox
2. Click "Load Temporary Add-on"
3. Select manifest.json from browser-extension folder
```

### 2. Download Live Chat

1. **Open a YouTube video** with live chat
   - Example: `https://www.youtube.com/watch?v=bLEThN1LSsM`

2. **Click the extension icon** in your toolbar

3. **Click "Download Live Chat (Replay)"** button
   - For replay chats (finished streams)
   - Or "Download Live Chat (Live)" for ongoing streams

4. **Choose save location** when prompted

5. The file will be saved as `VIDEO_ID.live_chat.json`

## Equivalent yt-dlp Commands

### This extension mimics these yt-dlp commands:

**Download Live Chat Replay:**
```bash
# yt-dlp command:
yt-dlp --cookies www.youtube.com_cookies.txt \
       --skip-download \
       --write-subs \
       --sub-lang "live_chat" \
       https://www.youtube.com/watch?v=VIDEO_ID

# Extension equivalent:
# 1. Navigate to the video
# 2. Click extension icon
# 3. Click "Download Live Chat (Replay)"
```

**Download Live Chat (Live Stream):**
```bash
# yt-dlp command:
yt-dlp --cookies www.youtube.com_cookies.txt \
       --skip-download \
       --write-subs \
       --sub-lang "live_chat" \
       https://www.youtube.com/watch?v=VIDEO_ID
# (for currently live streams)

# Extension equivalent:
# 1. Navigate to the live stream
# 2. Click extension icon
# 3. Click "Download Live Chat (Live)"
# 4. Click "Stop Download" when done
```

## Key Advantages Over yt-dlp

1. **No Cookie Export Required**: Uses browser's cookies automatically
2. **No Command Line**: Simple GUI interface
3. **Real-time Progress**: See download progress in popup
4. **Browser Integration**: Works seamlessly with your browsing

## Output Format

The extension produces **identical output** to yt-dlp:

```json
{"replayChatItemAction":{"actions":[{"addChatItemAction":{"item":{"liveChatTextMessageRenderer":{"message":{"runs":[{"text":"Hello!"}]},"authorName":{"simpleText":"User123"},"timestampUsec":"1234567890000000"}}}}]},"videoOffsetTimeMsec":"123456"}
{"replayChatItemAction":{"actions":[{"addChatItemAction":{"item":{"liveChatPaidMessageRenderer":{"message":{"runs":[{"text":"Super Chat!"}]},"purchaseAmountText":{"simpleText":"$5.00"}}}}}]},"videoOffsetTimeMsec":"234567"}
...
```

Each line is a complete JSON object representing a chat action.

## How It Works (Technical)

### 1. Cookie Authentication
```javascript
// The extension reads cookies directly from the browser
const sapisid = document.cookie.match(/SAPISID=([^;]*)/)[1];
// Generates SAPISIDHASH authorization header (same as yt-dlp)
```

### 2. Page Data Extraction
```javascript
// Extracts ytcfg (YouTube configuration)
const ytcfg = window.ytcfg.data_;
// Gets API key and context
const apiKey = ytcfg.INNERTUBE_API_KEY;
const context = ytcfg.INNERTUBE_CONTEXT;
```

### 3. Live Chat API Calls
```javascript
// Uses YouTube's InnerTube API (same as yt-dlp)
POST https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key={API_KEY}
{
  "context": { /* InnerTube context */ },
  "continuation": "CONTINUATION_TOKEN"
}
```

### 4. Continuation Parsing
```javascript
// Parses continuation data (mimics yt-dlp's parse_actions_replay)
for (const action of response.actions) {
  const offset = action.replayChatItemAction.videoOffsetTimeMsec;
  allActions.push(JSON.stringify(action));
}
```

## Example Workflows

### Workflow 1: Download Finished Stream Chat
```
1. Find a finished live stream on YouTube
2. Open the video page
3. Click extension icon
4. Click "Download Live Chat (Replay)"
5. Save file as "VIDEO_ID.live_chat.json"
6. Done! File contains all chat messages
```

### Workflow 2: Capture Live Stream Chat
```
1. Find an ongoing live stream
2. Open the video page
3. Click extension icon
4. Click "Download Live Chat (Live)"
5. Let it run (downloads messages in real-time)
6. Click "Stop Download" when satisfied
7. Save file as "VIDEO_ID.live_chat.json"
```

### Workflow 3: Batch Processing (Manual)
```
For multiple videos:
1. Open first video → Download chat
2. Open second video → Download chat
3. Open third video → Download chat
...

All files saved as VIDEO_ID.live_chat.json format
```

## Parsing the Output

The `.live_chat.json` file format:
- **Newline-delimited JSON** (one action per line)
- Each line can be parsed independently
- Compatible with yt-dlp's format

### Python Example:
```python
import json

with open('VIDEO_ID.live_chat.json', 'r') as f:
    for line in f:
        action = json.loads(line)
        replay_action = action.get('replayChatItemAction', {})
        actions = replay_action.get('actions', [])
        for act in actions:
            if 'addChatItemAction' in act:
                item = act['addChatItemAction']['item']
                if 'liveChatTextMessageRenderer' in item:
                    renderer = item['liveChatTextMessageRenderer']
                    message = ''.join([r['text'] for r in renderer['message']['runs']])
                    author = renderer['authorName']['simpleText']
                    timestamp = int(renderer['timestampUsec']) // 1000000
                    print(f"[{timestamp}] {author}: {message}")
```

### JavaScript Example:
```javascript
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('VIDEO_ID.live_chat.json'),
});

rl.on('line', (line) => {
  const action = JSON.parse(line);
  const replayAction = action.replayChatItemAction?.actions[0];
  const chatItem = replayAction?.addChatItemAction?.item;
  const renderer = chatItem?.liveChatTextMessageRenderer;
  
  if (renderer) {
    const message = renderer.message.runs.map(r => r.text).join('');
    const author = renderer.authorName.simpleText;
    const offset = action.videoOffsetTimeMsec;
    console.log(`[${offset}ms] ${author}: ${message}`);
  }
});
```

## Troubleshooting

### Issue: "No live chat available"
**Solution:**
- Check if the video has chat enabled
- For replays, wait until the stream finishes
- Some videos disable chat

### Issue: Extension icon is grayed out
**Solution:**
- Make sure you're on a YouTube watch page
- URL should be: `youtube.com/watch?v=...`
- Refresh the page if needed

### Issue: Download starts but immediately fails
**Solution:**
- Check browser console (F12) for errors
- Clear YouTube cookies and log in again
- Try a different video first

### Issue: File is empty or very small
**Solution:**
- The video might not have much chat
- Check if you stopped too early (for live streams)
- Verify the video actually has chat messages

## Tips & Best Practices

1. **For Long Streams**: Live chat downloads can be large. Stop periodically and restart if needed.

2. **Cookie Freshness**: If downloads fail, try:
   - Refreshing the YouTube page
   - Logging out and back into YouTube
   - Clearing YouTube cookies

3. **Multiple Downloads**: You can download chat from multiple videos in different tabs.

4. **File Organization**: Files are named `VIDEO_ID.live_chat.json` - rename them for better organization.

5. **Performance**: The extension uses the same efficient streaming approach as yt-dlp.

## Differences from yt-dlp

| Feature | yt-dlp | Extension |
|---------|--------|-----------|
| Cookie handling | Requires export | Automatic |
| Platform | Command line | Browser |
| Setup | Python + dependencies | One-click install |
| Output format | Identical | Identical |
| API calls | Same endpoints | Same endpoints |
| Authentication | SAPISIDHASH | SAPISIDHASH |

## Support

For issues or questions:
1. Check browser console for errors
2. Verify you're on a valid YouTube video page
3. Try with a different video to isolate the issue

## Advanced Usage

### Inspect Extension State
Open browser console on YouTube page:
```javascript
// Check if extension is loaded
console.log('[yt-dlp-livechat] should appear in console')

// Manually trigger download (if needed)
chrome.runtime.sendMessage({
  from: 'popup',
  type: 'startDownload',
  tabId: chrome.devtools.inspectedWindow.tabId,
  mode: 'replay'
});
```

### Debug Mode
Enable verbose logging in console:
```javascript
// Watch for progress updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'livechat-progress') {
    console.log(`Downloaded ${msg.totalLines} chat messages`);
  }
});
```
