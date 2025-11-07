# Testing Guide for YouTube Tools Extension

This document provides step-by-step instructions to test the browser extension.

## Prerequisites

1. A web browser (Chrome, Edge, Brave, Opera, or Firefox)
2. Logged into a YouTube account in the browser
3. The extension loaded in developer mode

## Loading the Extension

### Chrome/Edge/Brave/Opera

1. Open your browser
2. Navigate to `chrome://extensions/` (or `edge://extensions/` for Edge)
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `browser-extension` directory
6. The extension icon should appear in your toolbar

### Firefox

1. Open Firefox
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Navigate to the `browser-extension` directory
5. Select the `manifest.json` file
6. The extension icon should appear in your toolbar

## Test 1: Live Chat Downloader (Original Feature)

### Test Case 1.1: Download Live Chat Replay

1. Navigate to a finished YouTube live stream with chat replay
   - Example: Search for "youtube live stream with chat"
   - Find a completed stream
2. Click the extension icon
3. Should see "Live Chat Downloader" tab active
4. Should see "Download Live Chat (Replay)" button
5. Click the button
6. Browser should prompt to save a `.live_chat.json` file
7. Open the file - should contain JSON lines with chat messages

**Expected Result**: JSON file downloaded with chat replay data

### Test Case 1.2: Error Handling

1. Navigate to a regular YouTube video (not a live stream)
2. Click the extension icon
3. Should see warning: "This video does not have a live chat to download."

**Expected Result**: Appropriate error message displayed

## Test 2: Channel Live Stream Fetcher (New Feature)

### Test Case 2.1: Basic Functionality

1. Navigate to a YouTube channel with live streams
   - Example: `https://www.youtube.com/@chenyifaer`
   - Or any channel you know has live streams
2. Click the extension icon
3. Should automatically switch to "Channel Live Streams" tab
4. Click "Fetch All Live Videos" button
5. Wait for loading (may take a few seconds)
6. Should see list of videos with:
   - Video titles
   - Video IDs
   - Status badges (🔴 LIVE, ⏰ UPCOMING, or no badge for past)
   - Statistics showing counts

**Expected Result**: List of live stream videos displayed

### Test Case 2.2: Copy Single Video ID

1. Complete Test Case 2.1 first
2. Find a video in the list
3. Click "Copy" button next to the video ID
4. Paste into a text editor
5. Should paste the video ID

**Expected Result**: Video ID copied to clipboard

### Test Case 2.3: Copy All Video IDs

1. Complete Test Case 2.1 first
2. Click "Copy All Video IDs" button
3. Paste into a text editor
4. Should see one video ID per line

**Expected Result**: All video IDs copied, one per line

### Test Case 2.4: Export JSON

1. Complete Test Case 2.1 first
2. Click "Export as JSON" button
3. Browser should prompt to save a JSON file
4. Open the JSON file
5. Should contain:
   - `channel` object with channel metadata
   - `videos` array with video details
   - `totalCount`, `liveCount`, `upcomingCount`
   - `exportedAt` timestamp

**Expected Result**: Complete JSON export with all metadata

### Test Case 2.5: Click Video Title

1. Complete Test Case 2.1 first
2. Click on any video title in the list
3. Should open the video in a new browser tab

**Expected Result**: Video opens in new tab

### Test Case 2.6: Channel Detection

1. Navigate to a non-channel page (e.g., YouTube homepage)
2. Click the extension icon
3. Switch to "Channel Live Streams" tab
4. Should see warning: "Navigate to a YouTube channel page..."

**Expected Result**: Appropriate warning message

### Test Case 2.7: Error Handling - No Live Videos

1. Navigate to a channel with no live streams
   - Find a channel that only has regular uploads
2. Click the extension icon
3. Switch to "Channel Live Streams" tab (if not auto-switched)
4. Click "Fetch All Live Videos"
5. Should see message: "No live videos found on this channel"

**Expected Result**: Informative message about no results

## Test 3: Tab Switching

### Test Case 3.1: Switch Between Tabs

1. Navigate to a YouTube video page
2. Click the extension icon
3. Should be on "Live Chat Downloader" tab
4. Click "Channel Live Streams" tab
5. Should see channel live streams interface
6. Click "Live Chat Downloader" tab
7. Should return to live chat interface

**Expected Result**: Tabs switch smoothly without errors

### Test Case 3.2: Context-Aware Tab Selection

1. Navigate to a YouTube channel page (`/@channelname`)
2. Click the extension icon
3. Should automatically show "Channel Live Streams" tab

4. Navigate to a YouTube video page (`/watch?v=...`)
5. Click the extension icon
6. Should show "Live Chat Downloader" tab

**Expected Result**: Extension automatically selects appropriate tab based on page type

## Test 4: Edge Cases

### Test Case 4.1: Channel URL Formats

Test with different channel URL formats:
- `https://www.youtube.com/@channelname`
- `https://www.youtube.com/channel/UCxxxxxxxxx`
- `https://www.youtube.com/user/username`

**Expected Result**: Works with all URL formats

### Test Case 4.2: Not Logged In

1. Log out of YouTube
2. Navigate to a channel page
3. Click the extension icon
4. Try to fetch live videos
5. May see reduced results or error (depending on channel settings)

**Expected Result**: Graceful handling, possibly with fewer results

### Test Case 4.3: Rate Limiting

1. Rapidly click "Fetch All Live Videos" multiple times
2. Should handle rate limiting gracefully

**Expected Result**: No crashes, appropriate error messages if rate limited

## Test 5: Browser Compatibility

Test the extension in multiple browsers:

- [ ] Google Chrome
- [ ] Microsoft Edge
- [ ] Brave Browser
- [ ] Opera
- [ ] Firefox

**Expected Result**: Works consistently across all supported browsers

## Debugging

If you encounter issues:

1. **Check Browser Console**:
   - Right-click extension icon → Inspect popup
   - Check for JavaScript errors

2. **Check Content Script Console**:
   - Open YouTube page
   - Press F12 to open DevTools
   - Look for messages starting with `[yt-dlp-channel-lives]` or `[yt-dlp-livechat]`

3. **Verify Permissions**:
   - Go to `chrome://extensions/`
   - Click on extension details
   - Verify permissions are granted

4. **Check Network Requests**:
   - Open DevTools → Network tab
   - Look for requests to YouTube
   - Check for 403/401 errors (auth issues)

## Common Issues and Solutions

### Issue: "Unable to extract channel data"
- **Solution**: Refresh the page and try again
- **Cause**: YouTube page may not have loaded completely

### Issue: No videos found but channel has live streams
- **Solution**: 
  1. Make sure you're logged into YouTube
  2. Try navigating to the channel's "Live" tab manually first
  3. Refresh and try again

### Issue: Extension icon not visible
- **Solution**: 
  1. Pin the extension to toolbar
  2. Check if extension is enabled in extensions management

### Issue: "Failed to fetch streams page"
- **Solution**: 
  1. Check internet connection
  2. Verify you're logged into YouTube
  3. Try a different channel

## Performance Testing

### Memory Usage
1. Open Task Manager/Activity Monitor
2. Load the extension
3. Fetch live videos from several channels
4. Monitor memory usage
5. Should not exceed reasonable limits (~50-100MB)

### Load Time
1. Time how long it takes to fetch videos
2. Typical channels should load in 1-5 seconds
3. Large channels may take longer

## Security Testing

### Cookie Handling
1. Verify extension only accesses YouTube cookies
2. Check that SAPISIDHASH is generated correctly
3. Confirm no sensitive data is logged or exposed

### XSS Prevention
1. Test with channel names containing HTML/JS
2. Verify content is properly escaped in UI
3. Check that exported JSON doesn't execute code

## Automated Testing Checklist

- [ ] All JavaScript files pass syntax check (`node --check`)
- [ ] manifest.json is valid JSON
- [ ] HTML files are valid HTML5
- [ ] No console errors on normal operation
- [ ] Extension loads without errors
- [ ] All buttons are functional
- [ ] All tabs switch correctly
- [ ] Data exports successfully
- [ ] Error handling works properly
- [ ] Works on different channel types

## Reporting Issues

When reporting issues, include:

1. Browser name and version
2. Extension version
3. Steps to reproduce
4. Expected behavior
5. Actual behavior
6. Console errors (if any)
7. Channel URL (if relevant)
8. Screenshots (if applicable)

## Success Criteria

The extension passes testing if:

1. ✅ Live chat downloader works on video pages
2. ✅ Channel live stream fetcher works on channel pages
3. ✅ Tab switching is smooth
4. ✅ All export functions work
5. ✅ Error messages are clear and helpful
6. ✅ No console errors during normal operation
7. ✅ Works across supported browsers
8. ✅ UI is responsive and intuitive
9. ✅ Data formats match specifications
10. ✅ Handles edge cases gracefully

## Next Steps After Testing

1. Document any bugs found
2. Create issues for feature improvements
3. Test with real-world usage scenarios
4. Gather user feedback
5. Plan for future enhancements
