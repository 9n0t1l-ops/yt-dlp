(() => {
  const CLIENT_INFO = {
    clientName: 'WEB',
    clientVersion: '2.20250925.01.00',
    clientNameInt: 1,
  };

  const cloneData = (value) => {
    if (!value) {
      return value;
    }
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (error) {
        // fall through to JSON clone
      }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      console.warn('[yt-dlp-livechat] Failed to clone value', error);
      return null;
    }
  };

  const state = {
    downloading: false,
    shouldStop: false,
    mode: null,
  };

  const getVideoId = () => {
    const url = new URL(window.location.href);
    return url.searchParams.get('v');
  };

  const getPlayerResponse = () => {
    const player = window.ytInitialPlayerResponse || window.__ytInitialPlayerResponse;
    return cloneData(player) || null;
  };

  const extractInitialData = () => {
    if (typeof window.ytInitialData !== 'undefined') {
      return cloneData(window.ytInitialData);
    }

    const match = document.documentElement.innerHTML.match(/var ytInitialData\s*=\s*({.+?});/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (error) {
        console.warn('[yt-dlp-livechat] Failed to parse ytInitialData from HTML', error);
      }
    }
    return null;
  };

  const extractYtcfg = () => {
    if (window.ytcfg) {
      const data = window.ytcfg.data_ || window.ytcfg.data;
      if (data) {
        const cloned = cloneData(data);
        if (cloned) {
          return cloned;
        }
      }

      if (typeof window.ytcfg.get === 'function') {
        const keys = [
          'INNERTUBE_API_KEY',
          'INNERTUBE_CONTEXT',
          'INNERTUBE_CLIENT_NAME',
          'INNERTUBE_CLIENT_VERSION',
          'INNERTUBE_CONTEXT_CLIENT_NAME',
          'INNERTUBE_CONTEXT_CLIENT_VERSION',
          'VISITOR_DATA',
          'LOGGED_IN',
          'DELEGATED_SESSION_ID',
          'USER_SESSION_ID',
        ];
        const fallback = {};
        for (const key of keys) {
          const value = window.ytcfg.get(key);
          if (value !== undefined) {
            fallback[key] = value;
          }
        }
        if (Object.keys(fallback).length) {
          return fallback;
        }
      }
    }

    const match = document.documentElement.innerHTML.match(/ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (error) {
        console.warn('[yt-dlp-livechat] Failed to parse ytcfg from HTML', error);
      }
    }
    return null;
  };

  const getVideoMetadata = () => {
    const player = getPlayerResponse();
    const title = player?.videoDetails?.title || document.title || 'YouTube Live Chat';
    const author = player?.videoDetails?.author || '';
    return { title, author };
  };

  const pickFirst = (obj, keys) => {
    if (!obj) {
      return undefined;
    }
    for (const key of keys) {
      if (obj[key] !== undefined) {
        return obj[key];
      }
    }
    return undefined;
  };

  const inspectAvailability = (initialData) => {
    const conversationBar = initialData?.contents?.twoColumnWatchNextResults?.conversationBar;
    const liveChatRenderer = conversationBar?.liveChatRenderer;
    const replayRenderer = conversationBar?.liveChatReplayRenderer;

    const hasLive = !!liveChatRenderer;
    const hasReplay = !!replayRenderer;

    let initialContinuation = null;
    if (liveChatRenderer?.continuations?.length) {
      initialContinuation = liveChatRenderer.continuations[0];
    } else if (replayRenderer?.continuations?.length) {
      initialContinuation = replayRenderer.continuations[0];
    }

    const continuationToken = pickFirst(initialContinuation, [
      'reloadContinuationData',
      'invalidationContinuationData',
      'timedContinuationData',
      'liveChatReplayContinuationData',
    ]);

    return {
      hasChat: Boolean(hasLive || hasReplay),
      isLive: hasLive,
      isReplay: hasReplay,
      initialContinuation: continuationToken || null,
      liveChatRenderer,
      replayRenderer,
    };
  };

  const parseLiveTimestamp = (action) => {
    const actionContent = pickFirst(action, [
      'addChatItemAction',
      'addLiveChatTickerItemAction',
      'addBannerToLiveChatCommand',
    ]);
    if (!actionContent || typeof actionContent !== 'object') {
      return null;
    }

    const item = actionContent.item || actionContent.bannerRenderer;
    if (!item || typeof item !== 'object') {
      return null;
    }

    let renderer = pickFirst(item, [
      'liveChatTextMessageRenderer',
      'liveChatPaidMessageRenderer',
      'liveChatMembershipItemRenderer',
      'liveChatPaidStickerRenderer',
      'liveChatTickerPaidMessageItemRenderer',
      'liveChatTickerSponsorItemRenderer',
      'liveChatBannerRenderer',
    ]);
    if (!renderer || typeof renderer !== 'object') {
      return null;
    }

    const parentItem = renderer.showItemEndpoint?.showLiveChatItemEndpoint?.renderer || renderer.contents;
    if (parentItem) {
      renderer = pickFirst(parentItem, [
        'liveChatTextMessageRenderer',
        'liveChatPaidMessageRenderer',
        'liveChatMembershipItemRenderer',
        'liveChatPaidStickerRenderer',
      ]);
    }

    if (!renderer || typeof renderer !== 'object') {
      return null;
    }

    const timestampUsec = renderer.timestampUsec;
    if (!timestampUsec) {
      return null;
    }

    const numeric = Number.parseInt(timestampUsec, 10);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return Math.floor(numeric / 1000);
  };

  const parseReplayActions = (continuation) => {
    const lines = [];
    let offset = null;
    let continuationId = null;
    let clickTrackingParams = null;

    for (const action of continuation.actions || []) {
      const replay = action.replayChatItemAction;
      if (replay?.videoOffsetTimeMsec) {
        const parsed = Number.parseInt(replay.videoOffsetTimeMsec, 10);
        if (Number.isFinite(parsed)) {
          offset = parsed;
        }
      }
      lines.push(`${JSON.stringify(action)}\n`);
    }

    for (const entry of continuation.continuations || []) {
      const liveReplay = entry.liveChatReplayContinuationData || entry.reloadContinuationData;
      if (liveReplay?.continuation) {
        continuationId = liveReplay.continuation;
        clickTrackingParams = liveReplay.clickTrackingParams || liveReplay.trackingParams || clickTrackingParams;
        break;
      }
    }

    return { lines, continuationId, offset, clickTrackingParams };
  };

  const parseLiveActions = (continuation, liveOffset, startTime) => {
    const lines = [];
    let nextContinuationId = null;
    let nextClickTrackingParams = null;
    let timeoutMs = null;
    let currentOffset = liveOffset;

    for (const action of continuation.actions || []) {
      const timestamp = parseLiveTimestamp(action);
      if (timestamp !== null) {
        currentOffset = Math.max(timestamp - startTime, 0);
      }

      const pseudoAction = {
        replayChatItemAction: { actions: [action] },
        videoOffsetTimeMsec: String(Math.max(currentOffset, 0)),
        isLive: true,
      };
      lines.push(`${JSON.stringify(pseudoAction)}\n`);
    }

    for (const entry of continuation.continuations || []) {
      const timed = entry.timedContinuationData || entry.invalidationContinuationData;
      if (timed?.continuation) {
        nextContinuationId = timed.continuation;
        nextClickTrackingParams = timed.clickTrackingParams || nextClickTrackingParams;
        timeoutMs = Number.parseInt(timed.timeoutMs ?? timed.timeout, 10);
        if (!Number.isFinite(timeoutMs)) {
          timeoutMs = null;
        }
        break;
      }
    }

    return { lines, continuationId: nextContinuationId, clickTrackingParams: nextClickTrackingParams, timeoutMs, offset: currentOffset };
  };

  const sleepWithStop = (ms) => new Promise((resolve) => {
    if (!Number.isFinite(ms) || ms <= 0 || state.shouldStop) {
      resolve();
      return;
    }
    const handle = setTimeout(() => resolve(), ms);
  });

  const generateAuthHeader = async (origin = 'https://www.youtube.com') => {
    const readCookie = (name) => {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
      return match?.[1] || null;
    };

    const sapisid = readCookie('SAPISID') || readCookie('__Secure-3PAPISID') || readCookie('__Secure-1PAPISID');
    if (!sapisid) {
      return null;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const hashInput = `${timestamp} ${sapisid} ${origin}`;
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-1', encoder.encode(hashInput));
    const hashArray = Array.from(new Uint8Array(digest));
    const hex = hashArray.map((value) => value.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${timestamp}_${hex}`;
  };

  const buildApiHeaders = async (visitorData) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': String(CLIENT_INFO.clientNameInt),
      'X-YouTube-Client-Version': CLIENT_INFO.clientVersion,
      'Origin': 'https://www.youtube.com',
    };
    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    const auth = await generateAuthHeader();
    if (auth) {
      headers.Authorization = auth;
      headers['X-Origin'] = 'https://www.youtube.com';
    }

    return headers;
  };

  const fetchChatPage = async (url, headers) => {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Unable to retrieve live chat page (HTTP ${response.status})`);
    }
    return response.text();
  };

  const fetchContinuation = async (url, headers, body) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`YouTube API request failed (HTTP ${response.status})`);
    }
    return response.json();
  };

  const parseContinuationFromHtml = (html) => {
    const initialMatch = html.match(/var ytInitialData\s*=\s*({.+?});/);
    if (!initialMatch) {
      return null;
    }
    try {
      const initial = JSON.parse(initialMatch[1]);
      return initial?.continuationContents?.liveChatContinuation || null;
    } catch (error) {
      console.warn('[yt-dlp-livechat] Failed to parse chat page initial data', error);
      return null;
    }
  };

  const prepareContext = (innertubeContext) => {
    const contextClone = cloneData(innertubeContext) || {};
    const client = contextClone.client || {};
    client.clientName = client.clientName || CLIENT_INFO.clientName;
    client.clientVersion = client.clientVersion || CLIENT_INFO.clientVersion;
    contextClone.client = client;
    return contextClone;
  };

  const commenceDownload = async (mode) => {
    const initialData = extractInitialData();
    const ytcfg = extractYtcfg();
    const availability = inspectAvailability(initialData);
    const videoId = getVideoId();

    if (!videoId) {
      throw new Error('Unable to determine the video ID for this page.');
    }

    if (!ytcfg) {
      throw new Error('Failed to read YouTube configuration (ytcfg).');
    }

    if (!availability.hasChat) {
      throw new Error('This video does not expose a live chat.');
    }

    const apiKey = ytcfg.INNERTUBE_API_KEY;
    const innertubeContext = ytcfg.INNERTUBE_CONTEXT;
    if (!apiKey || !innertubeContext) {
      throw new Error('YouTube API credentials are unavailable on this page.');
    }

    const visitorData = ytcfg.VISITOR_DATA || innertubeContext?.client?.visitorData;

    const useReplay = mode === 'replay';
    if (useReplay && !availability.isReplay) {
      throw new Error('Only the live chat stream is available at the moment.');
    }
    if (!useReplay && !availability.isLive) {
      throw new Error('Only the replay chat is available for this video.');
    }

    const initialContinuation = availability.initialContinuation;
    if (!initialContinuation?.continuation) {
      throw new Error('Unable to locate the first continuation token.');
    }

    const apiUrl = useReplay
      ? `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key=${apiKey}`
      : `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${apiKey}`;

    const chatPageUrl = useReplay
      ? `https://www.youtube.com/live_chat_replay?continuation=${initialContinuation.continuation}`
      : `https://www.youtube.com/live_chat?continuation=${initialContinuation.continuation}`;

    const allLines = [];
    let continuationId = initialContinuation.continuation;
    let clickTrackingParams = initialContinuation.clickTrackingParams || initialContinuation.trackingParams || null;
    let offset = 0;
    let liveOffset = 0;
    let iteration = 0;
    const startTime = Date.now();

    while (continuationId && !state.shouldStop) {
      iteration += 1;
      let continuationPayload = null;

      if (iteration === 1) {
        const headers = await buildApiHeaders(visitorData);
        delete headers['Content-Type'];
        const html = await fetchChatPage(chatPageUrl, headers);
        const initialContinuationData = parseContinuationFromHtml(html);
        if (!initialContinuationData) {
          throw new Error('Failed to parse the live chat page.');
        }
        continuationPayload = initialContinuationData;

        if (useReplay) {
          const header = continuationPayload?.header?.liveChatHeaderRenderer;
          const menuItems = header?.viewSelector?.sortFilterSubMenuRenderer?.subMenuItems;
          if (menuItems && menuItems.length > 1) {
            const refresh = menuItems[1]?.continuation?.reloadContinuationData;
            if (refresh?.continuation) {
              continuationId = refresh.continuation;
              clickTrackingParams = refresh.clickTrackingParams || refresh.trackingParams || clickTrackingParams;
              offset = 0;
              continue;
            }
          }
        }
      } else {
        const headers = await buildApiHeaders(visitorData);
        const body = {
          context: prepareContext(innertubeContext),
          continuation: continuationId,
        };
        if (iteration > 1) {
          body.currentPlayerState = {
            playerOffsetMs: String(Math.max(offset - 5000, 0)),
          };
        }
        if (clickTrackingParams) {
          body.context.clickTracking = { clickTrackingParams };
        }
        const data = await fetchContinuation(apiUrl, headers, body);
        continuationPayload = data?.continuationContents?.liveChatContinuation;
        if (!continuationPayload) {
          throw new Error('YouTube returned an empty continuation response.');
        }
      }

      let parseResult;
      if (useReplay) {
        parseResult = parseReplayActions(continuationPayload);
        continuationId = parseResult.continuationId;
        if (typeof parseResult.offset === 'number') {
          offset = parseResult.offset;
        }
        clickTrackingParams = parseResult.clickTrackingParams || clickTrackingParams;
      } else {
        parseResult = parseLiveActions(continuationPayload, liveOffset, startTime);
        continuationId = parseResult.continuationId;
        liveOffset = parseResult.offset;
        offset = liveOffset;
        clickTrackingParams = parseResult.clickTrackingParams || clickTrackingParams;
        if (parseResult.timeoutMs) {
          await sleepWithStop(parseResult.timeoutMs);
        }
      }

      allLines.push(...parseResult.lines);

      chrome.runtime.sendMessage({
        from: 'content',
        type: 'livechat-progress',
        mode,
        totalLines: allLines.length,
        offset,
      }).catch(() => {});
    }

    if (state.shouldStop) {
      state.downloading = false;
      state.shouldStop = false;
      state.mode = null;
      chrome.runtime.sendMessage({ from: 'content', type: 'livechat-stopped' }).catch(() => {});
      return;
    }

    const output = allLines.join('');
    const fileName = `${videoId}.live_chat.json`;

    chrome.runtime.sendMessage({
      from: 'content',
      type: 'livechat-complete',
      fileName,
      data: output,
      totalLines: allLines.length,
      mimeType: 'application/json',
    }).catch(() => {});

    state.downloading = false;
    state.mode = null;
  };

  const reportError = (error) => {
    console.error('[yt-dlp-livechat] Download error:', error);
    chrome.runtime.sendMessage({
      from: 'content',
      type: 'livechat-error',
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {});
    state.downloading = false;
    state.mode = null;
    state.shouldStop = false;
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message?.type) {
      case 'yt-dlp-livechat-inspect': {
        const initialData = extractInitialData();
        const availability = inspectAvailability(initialData || {});
        const videoId = getVideoId();
        const meta = getVideoMetadata();
        sendResponse({
          hasChat: availability.hasChat,
          isLive: availability.isLive,
          isReplay: availability.isReplay,
          videoId,
          title: meta.title,
          isDownloading: state.downloading,
        });
        break;
      }

      case 'yt-dlp-livechat-start': {
        if (state.downloading) {
          sendResponse({ ok: false, error: 'A live chat download is already running.' });
          return;
        }
        state.downloading = true;
        state.shouldStop = false;
        state.mode = message.mode === 'live' ? 'live' : 'replay';
        commenceDownload(state.mode).catch(reportError);
        sendResponse({ ok: true });
        break;
      }

      case 'yt-dlp-livechat-stop': {
        if (!state.downloading) {
          sendResponse({ ok: false, error: 'No live chat download is in progress.' });
          return;
        }
        state.shouldStop = true;
        sendResponse({ ok: true });
        break;
      }

      default:
        break;
    }
  });

  console.log('[yt-dlp-livechat] Content script initialized');
})();
