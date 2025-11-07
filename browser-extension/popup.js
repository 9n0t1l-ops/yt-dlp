(() => {
  // ===== LIVE CHAT DOWNLOADER TAB =====
  const downloadReplayButton = document.getElementById('downloadLiveChat');
  const downloadLiveButton = document.getElementById('downloadLiveChatLive');
  const stopButton = document.getElementById('stopDownload');
  const statusDiv = document.getElementById('status');
  const warningDiv = document.getElementById('warning');

  let activeTabId = null;
  let availability = null;
  let backgroundState = null;

  function setStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
  }

  function clearStatus() {
    statusDiv.textContent = '';
    statusDiv.className = 'status';
    statusDiv.style.display = 'none';
  }

  function setWarning(message) {
    warningDiv.textContent = message;
    warningDiv.style.display = message ? 'block' : 'none';
  }

  function disableButtons(disabled) {
    downloadReplayButton.disabled = disabled;
    downloadLiveButton.disabled = disabled;
    stopButton.disabled = disabled && stopButton.style.display !== 'none';
  }

  function sendBackgroundMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  function updateButtonsVisibility() {
    const isDownloading = backgroundState?.status === 'downloading' || backgroundState?.status === 'starting';
    const canLive = availability?.isLive;
    const canReplay = availability?.isReplay;

    downloadLiveButton.style.display = canLive ? 'block' : 'none';
    downloadReplayButton.style.display = canReplay || !canLive ? 'block' : 'none';

    downloadLiveButton.disabled = !canLive || isDownloading;
    downloadReplayButton.disabled = (!canReplay && canLive) || isDownloading;

    stopButton.style.display = isDownloading ? 'block' : 'none';
    stopButton.disabled = !isDownloading;
  }

  async function refreshState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      setWarning('Unable to detect the active tab.');
      disableButtons(true);
      return;
    }

    activeTabId = tab.id;

    if (!tab.url || !tab.url.includes('youtube.com/watch')) {
      setWarning('Navigate to a YouTube watch page to download its live chat.');
      disableButtons(true);
      return;
    }

    const response = await sendBackgroundMessage({
      from: 'popup',
      type: 'getState',
      tabId: activeTabId,
    });

    if (!response?.ok) {
      setWarning(response?.error || 'Unable to communicate with the extension service worker.');
      disableButtons(true);
      return;
    }

    availability = response.info || {};
    backgroundState = response.state || { status: 'idle' };

    if (!availability?.hasChat) {
      setWarning('This video does not have a live chat to download.');
      disableButtons(true);
      return;
    }

    setWarning('');
    disableButtons(false);
    updateButtonsVisibility();

    if (backgroundState?.status === 'downloading') {
      setStatus(`Downloading live chat… saved ${backgroundState.totalLines || 0} entries so far.`, 'info');
    } else if (backgroundState?.status === 'complete') {
      setStatus('Latest download completed. You may start another download.', 'success');
    } else if (backgroundState?.status === 'error') {
      setStatus(backgroundState?.error || 'The previous download ended with an error.', 'error');
    } else {
      clearStatus();
    }
  }

  async function startDownload(mode) {
    if (!activeTabId) {
      setWarning('No active YouTube tab detected.');
      return;
    }

    disableButtons(true);
    setStatus('Preparing download…', 'info');

    const response = await sendBackgroundMessage({
      from: 'popup',
      type: 'startDownload',
      tabId: activeTabId,
      mode,
    });

    if (!response?.ok) {
      disableButtons(false);
      setStatus(response?.error || 'Failed to start live chat download.', 'error');
      await refreshState();
      return;
    }

    backgroundState = { status: 'downloading', mode };
    updateButtonsVisibility();
    setStatus('Downloading live chat…', 'info');
  }

  async function stopDownload() {
    if (!activeTabId) {
      return;
    }

    disableButtons(true);
    const response = await sendBackgroundMessage({
      from: 'popup',
      type: 'stopDownload',
      tabId: activeTabId,
    });

    if (!response?.ok) {
      setStatus(response?.error || 'Failed to stop download.', 'error');
    } else {
      setStatus('Stopping download…', 'info');
    }

    await refreshState();
  }

  downloadReplayButton.addEventListener('click', () => startDownload('replay'));
  downloadLiveButton.addEventListener('click', () => startDownload('live'));
  stopButton.addEventListener('click', () => stopDownload());

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.from !== 'background') {
      return;
    }
    if (!activeTabId || message.tabId !== activeTabId) {
      return;
    }

    switch (message.type) {
      case 'livechat-progress':
        backgroundState = {
          status: 'downloading',
          mode: message.mode,
          totalLines: message.totalLines,
          offset: message.offset,
        };
        updateButtonsVisibility();
        setStatus(`Downloading live chat… saved ${message.totalLines} entries.`, 'info');
        break;
      case 'livechat-complete':
        backgroundState = { status: 'complete', totalLines: message.totalLines };
        updateButtonsVisibility();
        setStatus('Live chat downloaded successfully. The file should appear in your downloads.', 'success');
        break;
      case 'livechat-stopped':
        backgroundState = { status: 'idle' };
        updateButtonsVisibility();
        setStatus('Download stopped.', 'info');
        break;
      case 'livechat-error':
        backgroundState = { status: 'error', error: message.error };
        updateButtonsVisibility();
        setStatus(message.error || 'An unexpected error occurred.', 'error');
        break;
      default:
        break;
    }
  });

  // ===== CHANNEL LIVE STREAMS TAB =====
  const channelFetchButton = document.getElementById('channelFetchLives');
  const channelCopyAllButton = document.getElementById('channelCopyAll');
  const channelExportButton = document.getElementById('channelExportJson');
  const channelStatusDiv = document.getElementById('channelStatus');
  const channelWarningDiv = document.getElementById('channelWarning');
  const channelListDiv = document.getElementById('channelLiveList');
  const channelStatsDiv = document.getElementById('channelStats');
  const channelInfoDiv = document.getElementById('channelInfo');
  const channelActionsDiv = document.getElementById('channelActions');

  let liveVideos = [];
  let channelInfo = null;

  function setChannelStatus(message, type = 'info') {
    channelStatusDiv.textContent = message;
    channelStatusDiv.className = `status ${type}`;
    channelStatusDiv.style.display = 'block';
  }

  function clearChannelStatus() {
    channelStatusDiv.textContent = '';
    channelStatusDiv.className = 'status';
    channelStatusDiv.style.display = 'none';
  }

  function setChannelWarning(message) {
    channelWarningDiv.textContent = message;
    channelWarningDiv.style.display = message ? 'block' : 'none';
  }

  function updateChannelStats() {
    if (liveVideos.length === 0) {
      channelStatsDiv.style.display = 'none';
      return;
    }

    const liveCount = liveVideos.filter(v => v.isLive).length;
    const upcomingCount = liveVideos.filter(v => v.isUpcoming).length;
    const pastCount = liveVideos.length - liveCount - upcomingCount;

    channelStatsDiv.className = 'stats visible';
    channelStatsDiv.innerHTML = `
      <strong>Total:</strong> ${liveVideos.length} videos | 
      <strong>🔴 Live:</strong> ${liveCount} | 
      <strong>⏰ Upcoming:</strong> ${upcomingCount} | 
      <strong>📼 Past:</strong> ${pastCount}
    `;
  }

  function renderChannelInfo() {
    if (!channelInfo) {
      channelInfoDiv.style.display = 'none';
      return;
    }

    const parts = [];
    if (channelInfo.title) {
      parts.push(`<strong>Channel:</strong> ${escapeHtml(channelInfo.title)}`);
    }
    if (channelInfo.id) {
      parts.push(`<strong>ID:</strong> <code>${channelInfo.id}</code>`);
    }

    if (parts.length > 0) {
      channelInfoDiv.innerHTML = parts.join('<br>');
      channelInfoDiv.style.display = 'block';
    }
  }

  function renderLiveList() {
    if (liveVideos.length === 0) {
      channelListDiv.innerHTML = '<div style="text-align:center;color:#606060;padding:20px;">No live videos found</div>';
      channelListDiv.className = 'live-list visible';
      channelActionsDiv.style.display = 'none';
      return;
    }

    channelListDiv.innerHTML = liveVideos.map((video, index) => {
      let badge = '';
      if (video.isLive) {
        badge = '<span class="live-badge">🔴 LIVE</span>';
      } else if (video.isUpcoming) {
        badge = '<span class="live-badge upcoming">⏰ UPCOMING</span>';
      }
      
      return `
        <div class="live-item" data-index="${index}">
          <div class="live-title" data-video-id="${video.videoId}">
            ${escapeHtml(video.title)}
            ${badge}
          </div>
          <div class="live-id">
            <span>ID: ${video.videoId}</span>
            <button class="copy-btn" data-video-id="${video.videoId}">Copy</button>
          </div>
        </div>
      `;
    }).join('');

    channelListDiv.className = 'live-list visible';
    channelActionsDiv.style.display = 'flex';

    channelListDiv.querySelectorAll('.live-title').forEach(el => {
      el.addEventListener('click', () => {
        const videoId = el.getAttribute('data-video-id');
        chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}` });
      });
    });

    channelListDiv.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = btn.getAttribute('data-video-id');
        copyToClipboard(videoId);
        const original = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = original; }, 1000);
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  async function fetchChannelLiveVideos() {
    channelFetchButton.disabled = true;
    setChannelStatus('Fetching live videos from channel...', 'info');
    liveVideos = [];
    channelInfo = null;
    channelListDiv.innerHTML = '';
    channelListDiv.className = 'live-list';
    channelStatsDiv.style.display = 'none';
    channelInfoDiv.style.display = 'none';
    channelActionsDiv.style.display = 'none';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error('Unable to detect the active tab.');
      }

      if (!tab.url || !tab.url.includes('youtube.com/@')) {
        throw new Error('Navigate to a YouTube channel page (e.g., https://www.youtube.com/@channelname)');
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'yt-dlp-fetch-channel-lives'
      });

      if (!response || !response.ok) {
        throw new Error(response?.error || 'Failed to fetch live videos');
      }

      liveVideos = response.videos || [];
      channelInfo = response.channel || null;
      
      if (liveVideos.length === 0) {
        setChannelStatus('No live videos found on this channel', 'info');
      } else {
        setChannelStatus(`Found ${liveVideos.length} live video(s)`, 'success');
      }

      renderChannelInfo();
      renderLiveList();
      updateChannelStats();
      
    } catch (error) {
      setChannelStatus(error.message, 'error');
      console.error('[channel-lives] Error:', error);
    } finally {
      channelFetchButton.disabled = false;
    }
  }

  channelFetchButton.addEventListener('click', fetchChannelLiveVideos);

  channelCopyAllButton.addEventListener('click', () => {
    const ids = liveVideos.map(v => v.videoId).join('\n');
    copyToClipboard(ids);
    const original = channelCopyAllButton.textContent;
    channelCopyAllButton.textContent = '✓ Copied';
    setTimeout(() => { channelCopyAllButton.textContent = original; }, 2000);
  });

  channelExportButton.addEventListener('click', () => {
    const jsonData = JSON.stringify({
      channel: channelInfo,
      videos: liveVideos,
      totalCount: liveVideos.length,
      liveCount: liveVideos.filter(v => v.isLive).length,
      upcomingCount: liveVideos.filter(v => v.isUpcoming).length,
      exportedAt: new Date().toISOString(),
    }, null, 2);
    
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const filename = channelInfo?.title 
      ? `${channelInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}-lives.json`
      : 'youtube-channel-lives.json';
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setChannelStatus('JSON exported successfully', 'success');
    });
  });

  // ===== TAB SWITCHING =====
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      tabPanels.forEach(panel => panel.classList.remove('active'));
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
      
      if (targetId === 'panel-livechat') {
        refreshState().catch((error) => {
          setWarning(error?.message || 'Unable to initialize live chat downloader.');
        });
      } else if (targetId === 'panel-channel') {
        initChannelTab();
      }
    });
  });

  function initChannelTab() {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url || !tab.url.includes('youtube.com/@')) {
          setChannelWarning('Navigate to a YouTube channel page (e.g., https://www.youtube.com/@channelname) to use this feature.');
        } else {
          setChannelWarning('');
        }
      } catch (error) {
        setChannelWarning('Unable to detect the current page.');
      }
    })();
  }

  // ===== INITIALIZATION =====
  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url || '';
      const isChannelPage = url.includes('youtube.com/@') && !url.includes('/watch');

      if (isChannelPage) {
        const channelTabButton = document.querySelector('.tab-button[data-target="panel-channel"]');
        if (channelTabButton) {
          channelTabButton.click();
        } else {
          initChannelTab();
        }
      } else {
        await refreshState();
      }
    } catch (error) {
      setWarning(error?.message || 'Unable to initialize the popup UI.');
    }
  })();
})();
