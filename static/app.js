document.addEventListener('DOMContentLoaded', () => {
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const intervalField = document.querySelector('.interval-field');
  const intervalSelect = intervalField?.querySelector('select');
  const stateChip = document.querySelector('[data-state]');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const brokerInput = document.querySelector('[data-broker]');
  const connectBtn = document.querySelector('[data-connect]');
  const topicInput = document.querySelector('[data-topic]');
  const messageInput = document.querySelector('[data-message]');
  const publishBtn = document.querySelector('[data-publish]');
  const clearBtn = document.querySelector('[data-clear]');
  const subscribeBtn = document.querySelector('[data-subscribe-btn]');
  const subscribeInput = document.querySelector('[data-subscribe-input]');
  const subscriptionList = document.querySelector('[data-subscription-list]');
  const logSentList = document.querySelector('[data-log-sent]');
  const logReceivedList = document.querySelector('[data-log-received]');

  // reading temp
  const tempRequestBtn = document.querySelector('[data-temp-request]');
  const cpuTempInput = document.querySelector('[data-cpu-temp]');

  let isConnected = false;
  let periodicTimer = null;
  let periodicActive = false;
  let isPublishing = false;
  let subscriptions = [];
  let logTimer = null;

  const setStatus = (state, label) => {
    if (!stateChip) return;
    stateChip.textContent = label;
    stateChip.classList.remove('success', 'neutral', 'pending', 'error');
    stateChip.classList.add(state);
  };
  const setConnectedStatus = () => setStatus('success', 'Status: Connected');

  setStatus('neutral', 'Status: Offline');

  if (stateChip) {
    stateChip.classList.add('neutral');
  }

  const getMode = () => document.querySelector('input[name="mode"]:checked')?.value || 'once';

  const setFieldLocks = (locked) => {
    if (topicInput) topicInput.disabled = locked;
    if (messageInput) messageInput.disabled = locked;
    if (clearBtn) clearBtn.disabled = locked;
    modeRadios.forEach((radio) => { radio.disabled = locked; });
  };

  const updateIntervalState = () => {
    const isPeriodic = getMode() === 'periodic';
    const shouldDisableInterval = !isPeriodic || periodicActive;
    intervalField.classList.toggle('is-disabled', shouldDisableInterval);
    if (intervalSelect) intervalSelect.disabled = shouldDisableInterval;
  };

  const setSubscribeAvailability = () => {
    if (!subscribeBtn) return;
    const topicReady = (subscribeInput?.value.trim().length || 0) > 0;
    subscribeBtn.disabled = !isConnected || !topicReady;
  };

  const renderSubscriptions = () => {
    if (!subscriptionList) return;
    subscriptionList.innerHTML = '';
    if (!subscriptions.length) {
      const hint = document.createElement('span');
      hint.className = 'pill';
      hint.textContent = 'No topics yet';
      subscriptionList.appendChild(hint);
      return;
    }
    subscriptions.forEach((topic) => {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = topic;
      subscriptionList.appendChild(pill);
    });
  };

  const setPublishAvailability = () => {
    if (!publishBtn) return;
    if (periodicActive) {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Stop';
      publishBtn.classList.add('danger');
      return;
    }

    const topicReady = (topicInput?.value.trim().length || 0) > 0;
    const messageReady = (messageInput?.value.trim().length || 0) > 0;
    publishBtn.classList.remove('danger');
    publishBtn.textContent = isPublishing ? 'Publishing...' : 'Publish';
    publishBtn.disabled = isPublishing || !isConnected || !topicReady || !messageReady;
  };
  setPublishAvailability();
  updateIntervalState();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light');
      themeToggle.textContent = isLight ? 'Dark theme' : 'Light theme';
    });
  }

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderLogs = (logs) => {
    const renderList = (target, items, incoming = false) => {
      if (!target) return;
      target.innerHTML = '';
      if (!items || !items.length) {
        const empty = document.createElement('li');
        empty.textContent = 'No messages yet';
        empty.style.color = 'var(--muted)';
        target.appendChild(empty);
        return;
      }
      items.forEach((item) => {
        const li = document.createElement('li');
        if (incoming) li.classList.add('incoming');

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = item.topic;

        const body = document.createElement('p');
        body.textContent = item.payload;

        const time = document.createElement('time');
        time.textContent = formatTime(item.time);

        li.appendChild(badge);
        li.appendChild(body);
        li.appendChild(time);
        target.appendChild(li);
      });
    };

    renderList(logSentList, logs.sent);
    renderList(logReceivedList, logs.received, true);
  };

  const connect = async () => {
    if (!brokerInput || !connectBtn) return;
    const broker = brokerInput.value.trim();
    if (!broker) {
      setStatus('error', 'Broker required');
      brokerInput.focus();
      return;
    }
    setStatus('pending', 'Connecting...');
    connectBtn.disabled = true;
    const originalLabel = connectBtn.textContent;
    connectBtn.textContent = 'Connecting...';
    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker })
      });
      const payload = await response.json();
      if (response.ok && payload.ok) {
        isConnected = true;
        setConnectedStatus();
        await loadSubscriptions();
        await loadLogs();
        startLogPolling();
      } else {
        isConnected = false;
        setStatus('error', payload.error ? `Error: ${payload.error}` : 'Failed to connect');
      }
    } catch (err) {
      isConnected = false;
      setStatus('error', 'Network error');
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = originalLabel;
      setPublishAvailability();
      setSubscribeAvailability();
    }
  };

  if (connectBtn) {
    connectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      connect();
    });
  }

  const sendPublish = async (topic, message) => {
    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, message })
      });
      const payload = await response.json();
      if (response.ok && payload.ok) {
        setConnectedStatus();
        await loadLogs();
        return true;
      }
      setStatus('error', payload.error ? `Error: ${payload.error}` : 'Failed to publish');
      return false;
    } catch (err) {
      setStatus('error', 'Network error');
      return false;
    }
  };

  const publishOnce = async () => {
    if (!publishBtn || !topicInput || !messageInput) return;
    if (!isConnected) {
      setStatus('error', 'Connect to the broker first');
      return;
    }

    const topic = topicInput.value.trim();
    const message = messageInput.value;
    if (!topic) {
      setStatus('error', 'Topic is required');
      topicInput.focus();
      return;
    }
    if (!message.trim()) {
      setStatus('error', 'Message is required');
      messageInput.focus();
      return;
    }

    isPublishing = true;
    setPublishAvailability();
    await sendPublish(topic, message);
    isPublishing = false;
    setPublishAvailability();
  };

  const stopPeriodic = () => {
    if (periodicTimer) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
    periodicActive = false;
    setFieldLocks(false);
    updateIntervalState();
    setPublishAvailability();
    if (isConnected) {
      setConnectedStatus();
    } else {
      setStatus('neutral', 'Status: Offline');
    }
  };

  const startPeriodic = async () => {
    if (!topicInput || !messageInput) return;
    if (!isConnected) {
      setStatus('error', 'Connect to the broker first');
      return;
    }
    const topic = topicInput.value.trim();
    const message = messageInput.value;
    if (!topic) {
      setStatus('error', 'Topic is required');
      topicInput.focus();
      return;
    }
    if (!message.trim()) {
      setStatus('error', 'Message is required');
      messageInput.focus();
      return;
    }

    const intervalSeconds = Number(intervalSelect?.value || 0) || 10;
    const intervalMs = intervalSeconds * 1000;

    periodicActive = true;
    setFieldLocks(true);
    updateIntervalState();
    setPublishAvailability();
    setStatus('pending', 'Starting periodic send...');

    const tick = async () => { await sendPublish(topic, message); };
    await tick();
    periodicTimer = setInterval(tick, intervalMs);
  };

  if (publishBtn) {
    publishBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = getMode();
      if (periodicActive) {
        stopPeriodic();
        return;
      }
      if (mode === 'periodic') {
        startPeriodic();
      } else {
        publishOnce();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (periodicActive) return;
      if (topicInput) topicInput.value = '';
      if (messageInput) messageInput.value = '';
      (topicInput || messageInput)?.focus();
      setPublishAvailability();
    });
  }

  modeRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      event.preventDefault();
      updateIntervalState();
      setPublishAvailability();
    });
  });

  [topicInput, messageInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', setPublishAvailability);
  });

  if (subscribeInput) {
    subscribeInput.addEventListener('input', setSubscribeAvailability);
  }

  const startLogPolling = () => {
    if (logTimer) clearInterval(logTimer);
    logTimer = setInterval(() => {
      if (isConnected) {
        loadLogs();
      }
    }, 4000);
  };

  const loadLogs = async () => {
    try {
      const response = await fetch('/api/logs');
      const payload = await response.json();
      if (response.ok && payload.ok && payload.logs) {
        renderLogs(payload.logs);
      }
    } catch (err) {
      // silent fail, keep UI as-is
    }
  };

  const loadSubscriptions = async () => {
    try {
      const response = await fetch('/api/subscriptions');
      const payload = await response.json();
      if (response.ok && payload.ok) {
        subscriptions = payload.topics || [];
        renderSubscriptions();
        setSubscribeAvailability();
      }
    } catch (err) {
      // ignore fetch errors silently for initial load
    }
  };

  const addSubscription = async () => {
    if (!subscribeBtn || !subscribeInput) return;
    const topic = subscribeInput.value.trim();
    if (!topic) {
      setStatus('error', 'Topic is required');
      subscribeInput.focus();
      return;
    }
    if (!isConnected) {
      setStatus('error', 'Connect to the broker first');
      return;
    }
    subscribeBtn.disabled = true;
    const originalLabel = subscribeBtn.textContent;
    subscribeBtn.textContent = 'Subscribing...';
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });
      const payload = await response.json();
      if (response.ok && payload.ok) {
        subscriptions = payload.topics || [];
        renderSubscriptions();
        subscribeInput.value = '';
        setConnectedStatus();
        await loadLogs();
      } else {
        setStatus('error', payload.error ? `Error: ${payload.error}` : 'Failed to subscribe');
      }
    } catch (err) {
      setStatus('error', 'Network error');
    } finally {
      subscribeBtn.textContent = originalLabel;
      subscribeBtn.disabled = false;
      setSubscribeAvailability();
    }
  };

  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addSubscription();
    });
  }

  renderSubscriptions();
  setSubscribeAvailability();
  loadLogs();

  // read temps function
  if (tempRequestBtn) {
  tempRequestBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!isConnected) {
      setStatus('error', 'Connect to the broker first');
      return;
    }

    const topic = 'device/cpu/temperature';
    const message = 'read';

    const success = await sendPublish(topic, message);
    if (success) {
      setStatus('success', 'Status: Connected');
    }
  });
}
});
