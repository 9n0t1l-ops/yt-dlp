const tabStates = new Map();

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').trim() || 'youtube-livechat.json';
}

async function downloadChatFile({ tabId, fileName, data, mimeType = 'application/json' }) {
  const safeName = sanitizeFilename(fileName);
  const blob = new Blob([data], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: blobUrl,
      filename: safeName,
      saveAs: true,
    }, (downloadId) => {
      const err = chrome.runtime.lastError;
      if (err) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error(err.message));
        return;
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      resolve(downloadId);
    });
  });
}

function updateState(tabId, partial) {
  const prev = tabStates.get(tabId) || { status: 'idle' };
  tabStates.set(tabId, { ...prev, ...partial });
}

function handlePopupMessage(message, sendResponse) {
  const { tabId, type } = message;

  if (!tabId) {
    sendResponse({ ok: false, error: 'No active YouTube tab detected.' });
    return;
  }

  switch (type) {
    case 'getState': {
      chrome.tabs.sendMessage(tabId, { type: 'yt-dlp-livechat-inspect' }, (info) => {
        const err = chrome.runtime.lastError;
        if (err) {
          sendResponse({ ok: false, error: err.message });
          return;
        }
        const state = tabStates.get(tabId) || { status: 'idle' };
        sendResponse({ ok: true, info, state });
      });
      return true;
    }

    case 'startDownload': {
      chrome.tabs.sendMessage(tabId, { type: 'yt-dlp-livechat-start', mode: message.mode }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          sendResponse({ ok: false, error: err.message });
          return;
        }
        if (!response?.ok) {
          sendResponse({ ok: false, error: response?.error || 'Unable to start live chat download.' });
          return;
        }
        updateState(tabId, { status: 'downloading', mode: message.mode, totalLines: 0 });
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'stopDownload': {
      chrome.tabs.sendMessage(tabId, { type: 'yt-dlp-livechat-stop' }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          sendResponse({ ok: false, error: err.message });
          return;
        }
        if (!response?.ok) {
          sendResponse({ ok: false, error: response?.error || 'Unable to stop live chat download.' });
          return;
        }
        updateState(tabId, { status: 'stopping' });
        sendResponse({ ok: true });
      });
      return true;
    }

    default:
      sendResponse({ ok: false, error: `Unknown request type: ${type}` });
  }
}

async function handleContentMessage(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    return;
  }

  switch (message.type) {
    case 'livechat-progress': {
      updateState(tabId, {
        status: 'downloading',
        mode: message.mode,
        totalLines: message.totalLines,
        offset: message.offset,
      });
      chrome.runtime.sendMessage({
        from: 'background',
        type: 'livechat-progress',
        tabId,
        totalLines: message.totalLines,
        offset: message.offset,
        mode: message.mode,
      }).catch(() => {});
      break;
    }

    case 'livechat-complete': {
      try {
        const downloadId = await downloadChatFile({
          tabId,
          fileName: message.fileName,
          data: message.data,
          mimeType: message.mimeType,
        });
        updateState(tabId, { status: 'complete', totalLines: message.totalLines, downloadId });
        chrome.runtime.sendMessage({
          from: 'background',
          type: 'livechat-complete',
          tabId,
          totalLines: message.totalLines,
          fileName: message.fileName,
          downloadId,
        }).catch(() => {});
      } catch (error) {
        updateState(tabId, { status: 'error', error: error.message });
        chrome.runtime.sendMessage({
          from: 'background',
          type: 'livechat-error',
          tabId,
          error: error.message,
        }).catch(() => {});
      }
      break;
    }

    case 'livechat-error': {
      updateState(tabId, { status: 'error', error: message.error });
      chrome.runtime.sendMessage({
        from: 'background',
        type: 'livechat-error',
        tabId,
        error: message.error,
      }).catch(() => {});
      break;
    }

    case 'livechat-stopped': {
      updateState(tabId, { status: 'idle' });
      chrome.runtime.sendMessage({
        from: 'background',
        type: 'livechat-stopped',
        tabId,
      }).catch(() => {});
      break;
    }

    default:
      break;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.from === 'popup') {
    return handlePopupMessage(message, sendResponse);
  }

  if (message?.from === 'content') {
    handleContentMessage(message, sender);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabStates.has(tabId)) {
    tabStates.delete(tabId);
  }
});
