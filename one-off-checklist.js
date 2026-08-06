(function () {
  var page = document.querySelector('.one-off-checklist-page');
  if (!page) return;
  if (!window.EtmOneOff) return;

  var params = new URLSearchParams(window.location.search);
  var storageKey = params.get('key') || '';
  var entry = storageKey ? window.EtmOneOff.findByStorageKey(storageKey) : null;
  if (!storageKey || !entry) {
    window.location.href = 'index.html';
    return;
  }

  var startedKey = storageKey + ':startedAt';
  var accumulatedKey = storageKey + ':accumulatedMs';
  var completedKey = storageKey + ':completedAt';
  var logKey = storageKey + ':log';
  var notesKey = storageKey + ':notes';

  document.getElementById('oneOffNameHeading').textContent = entry.name;
  document.getElementById('oneOffAddressLine').textContent = entry.address || 'One-Off Cleaning';
  var badge = document.getElementById('oneOffTypeBadge');
  badge.textContent = entry.type === 'W' ? 'Window Cleaning' : 'Janitorial';

  var timerDisplay = document.getElementById('timerDisplay');
  var timerLabel = document.getElementById('timerLabel');
  var timerToggle = document.getElementById('timerToggle');
  var timerIcon = document.getElementById('timerIcon');
  var notesEl = document.getElementById('oneOffNotes');
  var completeBtn = document.getElementById('oneOffCompleteBtn');
  var cancelBtn = document.getElementById('oneOffCancelBtn');
  var banner = document.getElementById('oneOffCompleteBanner');

  var ICON_PAUSE = '❚❚';
  var ICON_PLAY = '▶';
  var timerInterval = null;

  notesEl.value = localStorage.getItem(notesKey) || '';
  notesEl.addEventListener('input', function () {
    localStorage.setItem(notesKey, notesEl.value);
  });

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatElapsed(ms) {
    if (ms < 0) ms = 0;
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function getElapsedMs() {
    var startedAt = Number(localStorage.getItem(startedKey)) || 0;
    var accumulated = Number(localStorage.getItem(accumulatedKey)) || 0;
    if (startedAt) return accumulated + (Date.now() - startedAt);
    return accumulated;
  }

  function isRunning() {
    return !!localStorage.getItem(startedKey);
  }

  function tick() {
    timerDisplay.textContent = formatElapsed(getElapsedMs());
  }

  function pauseTimer() {
    var startedAt = Number(localStorage.getItem(startedKey));
    if (!startedAt) return;
    var accumulated = Number(localStorage.getItem(accumulatedKey)) || 0;
    localStorage.setItem(accumulatedKey, String(accumulated + (Date.now() - startedAt)));
    localStorage.removeItem(startedKey);
    renderTimerState();
  }

  function resumeTimer() {
    localStorage.setItem(startedKey, String(Date.now()));
    renderTimerState();
  }

  function renderTimerState() {
    timerDisplay.textContent = formatElapsed(getElapsedMs());
    if (isRunning()) {
      timerLabel.textContent = 'Cleaning Time';
      timerIcon.innerHTML = ICON_PAUSE;
      timerToggle.setAttribute('aria-label', 'Pause timer');
      if (!timerInterval) timerInterval = setInterval(tick, 1000);
    } else {
      timerLabel.textContent = 'Paused';
      timerIcon.innerHTML = ICON_PLAY;
      timerToggle.setAttribute('aria-label', 'Resume timer');
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }
  }

  timerToggle.addEventListener('click', function () {
    if (isRunning()) pauseTimer();
    else resumeTimer();
  });

  cancelBtn.addEventListener('click', function () {
    if (!window.confirm('Cancel this cleaning without logging it?')) return;
    localStorage.removeItem(startedKey);
    localStorage.removeItem(accumulatedKey);
    localStorage.removeItem(completedKey);
    localStorage.removeItem(notesKey);
    window.location.href = 'index.html';
  });

  completeBtn.addEventListener('click', function () {
    var now = Date.now();
    var startedAt = Number(localStorage.getItem(startedKey)) || 0;
    var accumulated = Number(localStorage.getItem(accumulatedKey)) || 0;
    var elapsedMs = startedAt ? accumulated + (now - startedAt) : accumulated;
    var sessionStart = now - elapsedMs;

    var log = [];
    try {
      var raw = localStorage.getItem(logKey);
      if (raw) log = JSON.parse(raw) || [];
    } catch (e) {
      log = [];
    }

    var noteText = (notesEl.value || '').trim();
    var logEntry = {
      sessionStart: sessionStart,
      completedAt: now,
      elapsedMs: elapsedMs,
      cleaners: 1,
      oneOff: true,
      customName: entry.name,
      customAddress: entry.address || '',
      customType: entry.type
    };
    if (noteText) logEntry.notesCurrent = noteText;
    log.push(logEntry);
    localStorage.setItem(logKey, JSON.stringify(log));
    localStorage.setItem(storageKey + ':lastCompletedAt', String(now));

    localStorage.removeItem(startedKey);
    localStorage.removeItem(accumulatedKey);
    localStorage.removeItem(completedKey);
    localStorage.removeItem(notesKey);

    banner.hidden = false;
    completeBtn.disabled = true;
    cancelBtn.disabled = true;
    timerToggle.disabled = true;
    window.setTimeout(function () {
      window.location.href = 'index.html';
    }, 1200);
  });

  renderTimerState();
})();
