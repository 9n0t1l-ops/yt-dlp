(() => {
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
    statusDiv.className = type;
    statusDiv.style.display = 'block';
  }

  function clearStatus() {
    statusDiv.textContent = '';
    statusDiv.className = '';
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

  refreshState().catch((error) => {
    setWarning(error?.message || 'Unable to initialize the popup UI.');
  });
})();
