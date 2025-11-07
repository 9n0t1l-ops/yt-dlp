(() => {
  const LOG_PREFIX = '[yt-dlp-channel-lives]';

  const CLIENT_INFO = {
    clientName: 'WEB',
    clientVersion: '2.20250925.01.00',
    clientNameInt: 1,
  };

  const textFromRuns = (data) => {
    if (!data) {
      return '';
    }
    if (typeof data === 'string') {
      return data;
    }
    const runs = data.runs || data;
    if (Array.isArray(runs)) {
      return runs.map((run) => run?.text || '').join('');
    }
    if (typeof data.simpleText === 'string') {
      return data.simpleText;
    }
    return '';
  };

  const readFromYtcfg = (key, fallback = null) => {
    try {
      if (window.ytcfg) {
        if (typeof window.ytcfg.get === 'function') {
          const value = window.ytcfg.get(key);
          if (value !== undefined) {
            return value;
          }
        }
        const data = window.ytcfg.data_ || window.ytcfg.data;
        if (data && data[key] !== undefined) {
          return data[key];
        }
      }
    } catch (error) {
      console.warn(LOG_PREFIX, 'ytcfg read error', error);
    }
    return fallback;
  };

  const extractObjectFromHtml = (html, marker) => {
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    const startIndex = html.indexOf('{', markerIndex);
    if (startIndex === -1) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < html.length; i++) {
      const char = html[i];
      endIndex = i;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }

    if (depth !== 0) {
      return null;
    }

    const jsonString = html.slice(startIndex, endIndex + 1);
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn(LOG_PREFIX, 'Failed to parse JSON from HTML', error);
      return null;
    }
  };

  const extractInitialDataFromDocument = () => {
    if (window.ytInitialData) {
      try {
        return JSON.parse(JSON.stringify(window.ytInitialData));
      } catch (error) {
        console.warn(LOG_PREFIX, 'Failed to clone ytInitialData', error);
      }
    }

    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('ytInitialData')) {
        continue;
      }
      const data = extractObjectFromHtml(text, 'ytInitialData');
      if (data) {
        return data;
      }
    }

    return null;
  };

  const extractInitialDataFromHtml = (html) => extractObjectFromHtml(html, 'ytInitialData');

  const readCookie = (name) => {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match?.[1] || null;
  };

  const generateAuthHeader = async (origin = 'https://www.youtube.com') => {
    const sapisid = readCookie('SAPISID') || readCookie('__Secure-3PAPISID') || readCookie('__Secure-1PAPISID');
    if (!sapisid) {
      return null;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const input = `${timestamp} ${sapisid} ${origin}`;
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-1', encoder.encode(input));
    const hashArray = Array.from(new Uint8Array(digest));
    const hex = hashArray.map((value) => value.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${timestamp}_${hex}`;
  };

  const buildRequestHeaders = async () => {
    const headers = new Headers();
    headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
    headers.set('Accept-Language', navigator.language || 'en-US,en;q=0.9');
    headers.set('Cache-Control', 'no-cache');

    const visitorData = readFromYtcfg('VISITOR_DATA', null);
    const clientName = readFromYtcfg('INNERTUBE_CONTEXT_CLIENT_NAME', CLIENT_INFO.clientNameInt);
    const clientVersion = readFromYtcfg('INNERTUBE_CONTEXT_CLIENT_VERSION', CLIENT_INFO.clientVersion);

    headers.set('X-YouTube-Client-Name', String(clientName ?? CLIENT_INFO.clientNameInt));
    headers.set('X-YouTube-Client-Version', clientVersion || CLIENT_INFO.clientVersion);

    if (visitorData) {
      headers.set('X-Goog-Visitor-Id', visitorData);
    }

    const authHeader = await generateAuthHeader();
    if (authHeader) {
      headers.set('Authorization', authHeader);
      headers.set('X-Origin', 'https://www.youtube.com');
    }

    return headers;
  };

  const determineChannelHandle = () => {
    const { pathname } = window.location;
    const match = pathname.match(/(@[^/]+)/);
    if (match) {
      return match[1];
    }
    const initialData = extractInitialDataFromDocument();
    const metadata = initialData?.metadata?.channelMetadataRenderer;
    if (metadata?.vanityChannelUrl) {
      const handleMatch = metadata.vanityChannelUrl.match(/(@[^/]+)/);
      if (handleMatch) {
        return handleMatch[1];
      }
    }
    if (metadata?.channelUrl) {
      const channelUrl = metadata.channelUrl;
      const handleMatch = channelUrl.match(/(@[^/]+)/);
      if (handleMatch) {
        return handleMatch[1];
      }
    }
    return null;
  };

  const determineChannelId = () => {
    const initialData = extractInitialDataFromDocument();
    const metadata = initialData?.metadata?.channelMetadataRenderer;
    return metadata?.externalId || metadata?.channelId || null;
  };

  const determineChannelStreamsUrl = () => {
    const url = new URL(window.location.href);
    const handle = determineChannelHandle();
    if (handle) {
      return `${url.origin}/${handle}/streams`;
    }

    const initialData = extractInitialDataFromDocument();
    const metadata = initialData?.metadata?.channelMetadataRenderer;
    if (metadata?.channelUrl) {
      return `${url.origin}${metadata.channelUrl}/streams`;
    }

    if (metadata?.vanityChannelUrl) {
      return `${url.origin}${metadata.vanityChannelUrl}/streams`;
    }

    return null;
  };

  const collectVideoRenderers = (root) => {
    const results = [];
    const visited = new WeakSet();
    const queue = [root];

    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      if (!node) {
        continue;
      }

      if (typeof node === 'object') {
        if (visited.has(node)) {
          continue;
        }
        visited.add(node);
      }

      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }

      if (typeof node !== 'object') {
        continue;
      }

      if (node.videoRenderer && typeof node.videoRenderer === 'object') {
        results.push(node.videoRenderer);
      }
      if (node.gridVideoRenderer && typeof node.gridVideoRenderer === 'object') {
        results.push(node.gridVideoRenderer);
      }
      if (node.richItemRenderer?.content?.videoRenderer) {
        results.push(node.richItemRenderer.content.videoRenderer);
      }

      for (const value of Object.values(node)) {
        if (value && (typeof value === 'object' || Array.isArray(value))) {
          queue.push(value);
        }
      }
    }

    return results;
  };

  const parseVideoStatus = (renderer) => {
    let isLive = false;
    let isUpcoming = false;

    const overlays = renderer.thumbnailOverlays || [];
    for (const overlay of overlays) {
      const status = overlay?.thumbnailOverlayTimeStatusRenderer?.style;
      if (status === 'LIVE') {
        isLive = true;
      } else if (status === 'UPCOMING') {
        isUpcoming = true;
      }
    }

    const badges = renderer.badges || renderer.ownerBadges || [];
    for (const badge of badges) {
      const rendererObj = badge?.metadataBadgeRenderer;
      if (!rendererObj) {
        continue;
      }
      const style = rendererObj.style;
      if (style === 'BADGE_STYLE_TYPE_LIVE_NOW' || style === 'BADGE_STYLE_TYPE_LIVE_NOW_ALT') {
        isLive = true;
      }
      if (style === 'BADGE_STYLE_TYPE_UPCOMING') {
        isUpcoming = true;
      }
    }

    if (renderer.upcomingEventData) {
      isUpcoming = true;
    }

    return { isLive, isUpcoming };
  };

  const parseVideoRenderer = (renderer) => {
    if (!renderer || typeof renderer !== 'object') {
      return null;
    }

    const videoId = renderer.videoId;
    if (!videoId) {
      return null;
    }

    const title = textFromRuns(renderer.title) || 'Untitled';
    const viewCountText = textFromRuns(renderer.viewCountText);
    const shortViewCountText = textFromRuns(renderer.shortViewCountText);
    const publishedTimeText = textFromRuns(renderer.publishedTimeText);
    const thumbnails = renderer.thumbnail?.thumbnails || [];
    const { isLive, isUpcoming } = parseVideoStatus(renderer);

    let scheduledStartTime = null;
    if (renderer.upcomingEventData?.startTime) {
      const parsed = Number.parseInt(renderer.upcomingEventData.startTime, 10);
      if (Number.isFinite(parsed)) {
        scheduledStartTime = new Date(parsed * 1000).toISOString();
      }
    }

    return {
      videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      isLive,
      isUpcoming,
      viewCountText,
      shortViewCountText,
      publishedTimeText,
      scheduledStartTime,
      thumbnails,
    };
  };

  const extractLiveVideos = (initialData) => {
    const renderers = collectVideoRenderers(initialData);
    const videos = [];
    const seen = new Set();

    for (const renderer of renderers) {
      const parsed = parseVideoRenderer(renderer);
      if (!parsed) {
        continue;
      }
      if (seen.has(parsed.videoId)) {
        continue;
      }

      // Only include videos that are live, upcoming, or were live streams.
      if (!parsed.isLive && !parsed.isUpcoming) {
        const isFromLiveStream = renderer?.thumbnailOverlays?.some((overlay) => {
          const text = overlay?.thumbnailOverlayTimeStatusRenderer?.text;
          const simple = text?.simpleText || textFromRuns(text);
          if (!simple) {
            return false;
          }
          return /live|stream/i.test(simple);
        });
        const hasBadge = (renderer?.badges || []).some((badge) => {
          const label = badge?.metadataBadgeRenderer?.label;
          return label ? /live|premiere|stream/i.test(label) : false;
        });
        if (!isFromLiveStream && !hasBadge) {
          continue;
        }
      }

      seen.add(parsed.videoId);
      videos.push(parsed);
    }

    return videos;
  };

  const fetchChannelLiveVideos = async () => {
    const streamsUrl = determineChannelStreamsUrl();
    if (!streamsUrl) {
      throw new Error('Unable to determine the channel streams URL.');
    }

    const headers = await buildRequestHeaders();

    const response = await fetch(streamsUrl, {
      method: 'GET',
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch streams page (HTTP ${response.status})`);
    }

    const html = await response.text();
    const initialData = extractInitialDataFromHtml(html);
    if (!initialData) {
      throw new Error('Unable to extract channel data from the streams page.');
    }

    const videos = extractLiveVideos(initialData);

    const metadata = initialData?.metadata?.channelMetadataRenderer;

    return {
      channel: {
        id: metadata?.externalId || determineChannelId(),
        title: metadata?.title || '',
        description: metadata?.description || '',
        url: metadata?.channelUrl ? `https://www.youtube.com${metadata.channelUrl}` : null,
        subscriberCountText: metadata?.subscriberCountText || null,
      },
      videos,
    };
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'yt-dlp-fetch-channel-lives') {
      return undefined;
    }

    (async () => {
      try {
        const result = await fetchChannelLiveVideos();
        sendResponse({ ok: true, videos: result.videos, channel: result.channel });
      } catch (error) {
        console.error(LOG_PREFIX, error);
        sendResponse({ ok: false, error: error.message || 'Unknown error' });
      }
    })();

    return true;
  });
})();
