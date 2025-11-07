# Example Usage - Channel Live Stream Fetcher

This document provides practical examples of using the Channel Live Stream Fetcher feature.

## Example 1: Fetch Live Streams from a Channel

Let's fetch all live streams from the channel `@chenyifaer`:

1. Navigate to: `https://www.youtube.com/@chenyifaer`
2. Click the extension icon in your browser toolbar
3. The extension will automatically switch to "Channel Live Streams" tab
4. Click "Fetch All Live Videos"
5. Wait for the results to load

You'll see something like:

```
Found 15 live video(s)

Channel: 陈一发儿
ID: UCxxxxxxxxxxxxxxxx

Total: 15 videos | 🔴 Live: 0 | ⏰ Upcoming: 2 | 📼 Past: 13

[List of videos with titles, IDs, and status badges]
```

## Example 2: Copy Video IDs for Batch Download

After fetching the live streams:

1. Click "Copy All Video IDs"
2. Paste into a text file (`video_ids.txt`)
3. Use with yt-dlp:

### Linux/Mac:

```bash
# Download all videos
cat video_ids.txt | while read id; do
  yt-dlp "https://www.youtube.com/watch?v=${id}"
done

# Download only audio
cat video_ids.txt | while read id; do
  yt-dlp -x --audio-format mp3 "https://www.youtube.com/watch?v=${id}"
done

# Download with subtitles
cat video_ids.txt | while read id; do
  yt-dlp --write-subs --sub-lang en,zh "https://www.youtube.com/watch?v=${id}"
done
```

### Windows PowerShell:

```powershell
# Download all videos
Get-Content video_ids.txt | ForEach-Object {
  yt-dlp "https://www.youtube.com/watch?v=$_"
}

# Download only audio
Get-Content video_ids.txt | ForEach-Object {
  yt-dlp -x --audio-format mp3 "https://www.youtube.com/watch?v=$_"
}
```

## Example 3: Export and Analyze JSON Data

After fetching live streams:

1. Click "Export as JSON"
2. Save the file (e.g., `channel_lives.json`)
3. Process with Python:

```python
import json
from datetime import datetime

# Load the exported data
with open('channel_lives.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Print summary
print(f"Channel: {data['channel']['title']}")
print(f"Channel ID: {data['channel']['id']}")
print(f"Total videos: {data['totalCount']}")
print(f"Live now: {data['liveCount']}")
print(f"Upcoming: {data['upcomingCount']}")
print()

# List all currently live streams
print("Currently Live Streams:")
for video in data['videos']:
    if video['isLive']:
        print(f"  🔴 {video['title']}")
        print(f"     URL: {video['url']}")
        print(f"     Views: {video.get('viewCountText', 'N/A')}")
        print()

# List upcoming streams with scheduled times
print("Upcoming Streams:")
for video in data['videos']:
    if video['isUpcoming']:
        scheduled = video.get('scheduledStartTime')
        if scheduled:
            dt = datetime.fromisoformat(scheduled.replace('Z', '+00:00'))
            print(f"  ⏰ {video['title']}")
            print(f"     Scheduled: {dt.strftime('%Y-%m-%d %H:%M:%S UTC')}")
            print(f"     URL: {video['url']}")
            print()

# Generate yt-dlp batch file
with open('download_batch.txt', 'w', encoding='utf-8') as f:
    for video in data['videos']:
        f.write(f"{video['url']}\n")

print(f"Created download_batch.txt with {len(data['videos'])} URLs")
```

## Example 4: Filter Live Streams by Date

Using the exported JSON, you can filter videos by publish date:

```python
import json
from datetime import datetime, timedelta

with open('channel_lives.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Filter videos from the last 30 days (based on text, not perfect)
recent_keywords = ['day ago', 'days ago', 'week ago', 'weeks ago', 'hour ago', 'hours ago']

recent_videos = []
for video in data['videos']:
    published = video.get('publishedTimeText', '')
    if any(keyword in published.lower() for keyword in recent_keywords):
        recent_videos.append(video)

print(f"Found {len(recent_videos)} recent live streams")

# Save recent video IDs
with open('recent_video_ids.txt', 'w') as f:
    for video in recent_videos:
        f.write(f"{video['videoId']}\n")
```

## Example 5: Compare Multiple Channels

You can fetch and compare live stream counts from multiple channels:

```python
import json

channels_data = []

# Fetch data from multiple channels using the extension
# Save each as channel1.json, channel2.json, etc.

for i in range(1, 4):
    with open(f'channel{i}.json', 'r', encoding='utf-8') as f:
        channels_data.append(json.load(f))

# Compare
print("Channel Comparison:")
print("-" * 80)
for data in channels_data:
    channel = data['channel']
    print(f"{channel['title']:<30} | Total: {data['totalCount']:>3} | Live: {data['liveCount']:>2} | Upcoming: {data['upcomingCount']:>2}")
```

## Example 6: Monitor for New Live Streams

Create a simple monitor script:

```python
import json
import time
import os

CHANNEL_URL = "https://www.youtube.com/@chenyifaer"
CHECK_FILE = "previous_live_count.txt"

def load_previous_count():
    if os.path.exists(CHECK_FILE):
        with open(CHECK_FILE, 'r') as f:
            return int(f.read().strip())
    return 0

def save_current_count(count):
    with open(CHECK_FILE, 'w') as f:
        f.write(str(count))

# Manually fetch using the extension and export JSON as channel_latest.json
if os.path.exists('channel_latest.json'):
    with open('channel_latest.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    current_live = data['liveCount']
    previous_live = load_previous_count()
    
    if current_live > previous_live:
        print(f"🔴 NEW LIVE STREAM DETECTED! ({current_live} live now, was {previous_live})")
        for video in data['videos']:
            if video['isLive']:
                print(f"   Title: {video['title']}")
                print(f"   URL: {video['url']}")
                # You could send a notification here
    elif current_live < previous_live:
        print(f"Stream ended. {current_live} live now (was {previous_live})")
    else:
        print(f"No change. {current_live} stream(s) currently live")
    
    save_current_count(current_live)
```

## Example 7: Create a Watchlist

Generate an HTML page with all live streams:

```python
import json

with open('channel_lives.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>{data['channel']['title']} - Live Streams</title>
    <style>
        body {{ font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }}
        .video {{ background: white; padding: 15px; margin: 10px 0; border-radius: 5px; }}
        .live {{ border-left: 4px solid #cc0000; }}
        .upcoming {{ border-left: 4px solid #065fd4; }}
        .badge {{ display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 12px; }}
        .badge-live {{ background: #cc0000; color: white; }}
        .badge-upcoming {{ background: #065fd4; color: white; }}
        a {{ color: #065fd4; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <h1>{data['channel']['title']} - Live Streams</h1>
    <p>Total: {data['totalCount']} | Live: {data['liveCount']} | Upcoming: {data['upcomingCount']}</p>
"""

for video in data['videos']:
    css_class = 'live' if video['isLive'] else 'upcoming' if video['isUpcoming'] else ''
    badge = ''
    if video['isLive']:
        badge = '<span class="badge badge-live">🔴 LIVE</span>'
    elif video['isUpcoming']:
        badge = '<span class="badge badge-upcoming">⏰ UPCOMING</span>'
    
    html += f"""
    <div class="video {css_class}">
        <h3><a href="{video['url']}" target="_blank">{video['title']}</a> {badge}</h3>
        <p>Video ID: <code>{video['videoId']}</code></p>
        <p>{video.get('viewCountText', '')} • {video.get('publishedTimeText', '')}</p>
    </div>
    """

html += """
</body>
</html>
"""

with open('watchlist.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Created watchlist.html")
```

## Tips

1. **Refresh regularly**: Channel data changes as new streams are scheduled or go live
2. **Export periodically**: Keep historical records by exporting with timestamps in filename
3. **Combine with yt-dlp**: Use the video IDs to download content with specific yt-dlp options
4. **Use JSON for automation**: The structured JSON format is perfect for scripting and automation
5. **Check permissions**: Make sure you're logged into YouTube for the best results

## Common Workflows

### Workflow 1: Daily Archive Download
```bash
# 1. Open channel in browser
# 2. Use extension to fetch and export JSON
# 3. Run this script:
python3 << 'EOF'
import json
import subprocess
import os
from datetime import datetime

with open('channel_lives.json', 'r') as f:
    data = json.load(f)

archive_dir = f"archive_{datetime.now().strftime('%Y%m%d')}"
os.makedirs(archive_dir, exist_ok=True)

for video in data['videos']:
    if not video['isLive'] and not video['isUpcoming']:
        cmd = [
            'yt-dlp',
            '-o', f'{archive_dir}/%(title)s-%(id)s.%(ext)s',
            '--write-info-json',
            '--write-thumbnail',
            video['url']
        ]
        subprocess.run(cmd)
EOF
```

### Workflow 2: Live Stream Alert
```bash
# Create a cron job that runs every 5 minutes
# */5 * * * * /path/to/check_live.sh

#!/bin/bash
# check_live.sh
CHANNEL_JSON="$HOME/channel_latest.json"
# You need to manually export JSON periodically
if [ -f "$CHANNEL_JSON" ]; then
    LIVE_COUNT=$(jq '.liveCount' "$CHANNEL_JSON")
    if [ "$LIVE_COUNT" -gt 0 ]; then
        # Send notification (example using notify-send on Linux)
        notify-send "🔴 Live Stream Active!" "Check YouTube now!"
    fi
fi
```

## Conclusion

The Channel Live Stream Fetcher makes it easy to track, archive, and process live streams from your favorite YouTube channels. Combine it with yt-dlp and scripting for powerful automation workflows!
