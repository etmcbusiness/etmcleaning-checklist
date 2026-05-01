(function () {
  const page = document.querySelector('.checklist-page');
  if (!page) return;

  const storageKey = page.dataset.storageKey || 'checklist-default';
  const completedKey = storageKey + ':completedAt';
  const startedKey = storageKey + ':startedAt';
  const accumulatedKey = storageKey + ':accumulatedMs';
  const logKey = storageKey + ':log';
  const taskTimingsKey = storageKey + ':taskTimings';

  const checkboxes = Array.from(page.querySelectorAll('input[type="checkbox"]'));
  const requiredCheckboxes = checkboxes.filter(
    (cb) => !cb.closest('.task-group.optional')
  );
  const notesEls = Array.from(page.querySelectorAll('textarea[data-note-key]'));
  const pctEl = page.querySelector('#progressPct');
  const fillEl = page.querySelector('#progressFill');
  const timerEl = document.getElementById('cleaningTimer');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerLabel = document.getElementById('timerLabel');
  const timerToggle = document.getElementById('timerToggle');
  const timerIcon = document.getElementById('timerIcon');
  let timerInterval = null;

  const ICON_PAUSE = '\u275A\u275A';
  const ICON_PLAY = '\u25B6';

  function noteStorageKey(el) {
    return storageKey + ':' + el.dataset.noteKey;
  }
  const resetBtn = page.querySelector('#resetBtn');
  const completeBtn = page.querySelector('#completeBtn');
  const banner = page.querySelector('#completeBanner');
  const completedAtEl = page.querySelector('#completedAt');
  const todayDateEl = page.querySelector('#todayDate');

  if (todayDateEl) {
    todayDateEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function saveState() {
    const state = checkboxes.map((cb) => cb.checked);
    localStorage.setItem(storageKey, JSON.stringify(state));
    notesEls.forEach((el) => {
      localStorage.setItem(noteStorageKey(el), el.value);
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const state = JSON.parse(raw);
        checkboxes.forEach((cb, i) => {
          cb.checked = !!state[i];
          updateRow(cb);
        });
      }
    } catch (e) { /* ignore */ }

    notesEls.forEach((el) => {
      el.value = localStorage.getItem(noteStorageKey(el)) || '';
    });

    const completed = localStorage.getItem(completedKey);
    if (completed) {
      banner.hidden = false;
      const completedDisplay = isNaN(Number(completed))
        ? completed
        : new Date(Number(completed)).toLocaleString();
      completedAtEl.textContent = '(' + completedDisplay + ')';
    }

    initTimer();
  }

  function formatElapsed(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function getElapsedMs() {
    const startedAt = Number(localStorage.getItem(startedKey)) || 0;
    const accumulated = Number(localStorage.getItem(accumulatedKey)) || 0;
    const completedAt = Number(localStorage.getItem(completedKey)) || 0;

    if (completedAt) {
      if (startedAt) return accumulated + (completedAt - startedAt);
      return accumulated;
    }
    if (startedAt) return accumulated + (Date.now() - startedAt);
    return accumulated;
  }

  function hasSession() {
    return !!(localStorage.getItem(startedKey) || localStorage.getItem(accumulatedKey));
  }

  function isRunning() {
    return !!localStorage.getItem(startedKey)
      && !localStorage.getItem(completedKey);
  }

  function isPaused() {
    return !localStorage.getItem(startedKey)
      && !!localStorage.getItem(accumulatedKey)
      && !localStorage.getItem(completedKey);
  }

  function isCompleted() {
    return !!localStorage.getItem(completedKey);
  }

  function tickTimer() {
    timerDisplay.textContent = formatElapsed(getElapsedMs());
  }

  function pauseTimer() {
    const startedAt = Number(localStorage.getItem(startedKey));
    if (!startedAt) return;
    const accumulated = Number(localStorage.getItem(accumulatedKey)) || 0;
    const newAccumulated = accumulated + (Date.now() - startedAt);
    localStorage.setItem(accumulatedKey, String(newAccumulated));
    localStorage.removeItem(startedKey);
    initTimer();
  }

  function resumeTimer() {
    localStorage.setItem(startedKey, String(Date.now()));
    initTimer();
  }

  function initTimer() {
    if (!hasSession()) {
      timerEl.hidden = true;
      timerEl.classList.remove('completed', 'paused');
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      return;
    }

    timerEl.hidden = false;
    timerDisplay.textContent = formatElapsed(getElapsedMs());

    if (isCompleted()) {
      timerEl.classList.add('completed');
      timerEl.classList.remove('paused');
      timerLabel.textContent = 'Completed';
      timerToggle.hidden = true;
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      return;
    }

    timerEl.classList.remove('completed');
    timerToggle.hidden = false;

    if (isPaused()) {
      timerEl.classList.add('paused');
      timerLabel.textContent = 'Paused';
      timerIcon.innerHTML = ICON_PLAY;
      timerToggle.setAttribute('aria-label', 'Resume timer');
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    } else {
      timerEl.classList.remove('paused');
      timerLabel.textContent = 'Cleaning Time';
      timerIcon.innerHTML = ICON_PAUSE;
      timerToggle.setAttribute('aria-label', 'Pause timer');
      if (!timerInterval) {
        timerInterval = setInterval(tickTimer, 1000);
      }
    }
  }

  if (timerToggle) {
    timerToggle.addEventListener('click', () => {
      if (isCompleted()) return;
      if (!hasSession()) return;
      if (isRunning()) {
        pauseTimer();
      } else {
        resumeTimer();
      }
    });
  }

  function updateRow(cb) {
    const li = cb.closest('li');
    if (li) li.classList.toggle('checked', cb.checked);
  }

  function updateProgress() {
    const done = requiredCheckboxes.filter((cb) => cb.checked).length;
    const total = requiredCheckboxes.length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    pctEl.textContent = pct;
    fillEl.style.width = pct + '%';
  }

  function getTaskText(checkbox) {
    const span = checkbox.parentElement && checkbox.parentElement.querySelector('span');
    if (!span) return 'Task';
    let text = '';
    span.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        text += node.textContent;
      }
    });
    text = text.replace(/\s+/g, ' ').trim();
    return text || span.textContent.replace(/\s+/g, ' ').trim();
  }

  function formatShortDuration(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  }

  function readTaskTimings() {
    try {
      const raw = localStorage.getItem(taskTimingsKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function setTaskMarker(idx, durationMs) {
    const cb = checkboxes[idx];
    if (!cb) return;
    const label = cb.closest('label');
    if (!label) return;
    let marker = label.querySelector('.task-duration-marker');
    if (!marker) {
      marker = document.createElement('span');
      marker.className = 'task-duration-marker';
      label.appendChild(marker);
    }
    marker.textContent = formatShortDuration(durationMs);
  }

  function removeTaskMarker(idx) {
    const cb = checkboxes[idx];
    if (!cb) return;
    const label = cb.closest('label');
    if (!label) return;
    const marker = label.querySelector('.task-duration-marker');
    if (marker) marker.remove();
  }

  function clearAllTaskMarkers() {
    document.querySelectorAll('.task-duration-marker').forEach((el) => el.remove());
  }

  function restoreTaskMarkers() {
    clearAllTaskMarkers();
    const timings = readTaskTimings();
    timings.forEach((t) => {
      if (typeof t.durationMs === 'number') {
        setTaskMarker(t.idx, t.durationMs);
      }
    });
  }

  function recordTaskCheck(idx, isChecked) {
    if (!hasSession() || isCompleted()) {
      removeTaskMarker(idx);
      return;
    }
    let timings = readTaskTimings().filter((t) => t.idx !== idx);
    if (isChecked) {
      const elapsedMs = getElapsedMs();
      const prevElapsedMs = timings.reduce(
        (max, t) => (typeof t.elapsedMs === 'number' && t.elapsedMs > max ? t.elapsedMs : max),
        0
      );
      const durationMs = Math.max(0, elapsedMs - prevElapsedMs);
      timings.push({
        idx: idx,
        text: getTaskText(checkboxes[idx]),
        optional: !!checkboxes[idx].closest('.task-group.optional'),
        elapsedMs: elapsedMs,
        durationMs: durationMs
      });
      setTaskMarker(idx, durationMs);
    } else {
      removeTaskMarker(idx);
    }
    localStorage.setItem(taskTimingsKey, JSON.stringify(timings));
  }

  checkboxes.forEach((cb, idx) => {
    cb.addEventListener('change', () => {
      updateRow(cb);
      updateProgress();
      saveState();
      recordTaskCheck(idx, cb.checked);
    });
  });

  notesEls.forEach((el) => {
    el.addEventListener('input', saveState);
  });

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset all checkboxes, notes, and timer for this checklist?')) return;
    checkboxes.forEach((cb) => {
      cb.checked = false;
      updateRow(cb);
    });
    notesEls.forEach((el) => {
      el.value = '';
      localStorage.removeItem(noteStorageKey(el));
    });
    localStorage.removeItem(storageKey);
    localStorage.removeItem(completedKey);
    localStorage.removeItem(startedKey);
    localStorage.removeItem(accumulatedKey);
    localStorage.removeItem(taskTimingsKey);
    clearAllTaskMarkers();
    banner.hidden = true;
    updateProgress();
    initTimer();
  });

  function appendLogEntry(completedAt) {
    const startedAt = Number(localStorage.getItem(startedKey)) || 0;
    const accumulated = Number(localStorage.getItem(accumulatedKey)) || 0;
    let elapsedMs;
    let sessionStart;
    if (startedAt) {
      elapsedMs = accumulated + (completedAt - startedAt);
      sessionStart = completedAt - elapsedMs;
    } else {
      elapsedMs = accumulated;
      sessionStart = completedAt - elapsedMs;
    }

    let log = [];
    try {
      const raw = localStorage.getItem(logKey);
      if (raw) log = JSON.parse(raw) || [];
    } catch (e) { log = []; }

    const tasks = readTaskTimings()
      .slice()
      .sort((a, b) => (a.elapsedMs || 0) - (b.elapsedMs || 0));

    log.push({
      sessionStart: sessionStart,
      completedAt: completedAt,
      elapsedMs: elapsedMs,
      tasks: tasks
    });
    localStorage.setItem(logKey, JSON.stringify(log));
  }

  function getBackUrl() {
    const backLink = page.querySelector('.back-link');
    if (backLink && backLink.getAttribute('href')) {
      return backLink.getAttribute('href');
    }
    return 'index.html';
  }

  function finalizeCompletion() {
    const now = Date.now();
    appendLogEntry(now);

    let carryNotes = '';
    let currentNoteEl = null;
    notesEls.forEach((el) => {
      if (el.dataset.noteKey === 'notes-next') {
        carryNotes = el.value || '';
      }
      if (el.dataset.noteKey === 'notes-current') {
        currentNoteEl = el;
      }
    });

    checkboxes.forEach((cb) => { cb.checked = false; });
    notesEls.forEach((el) => {
      el.value = '';
      localStorage.removeItem(noteStorageKey(el));
    });
    localStorage.removeItem(storageKey);
    localStorage.removeItem(completedKey);
    localStorage.removeItem(startedKey);
    localStorage.removeItem(accumulatedKey);
    localStorage.removeItem(taskTimingsKey);

    if (carryNotes.trim() && currentNoteEl) {
      localStorage.setItem(noteStorageKey(currentNoteEl), carryNotes);
    }

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    window.location.href = getBackUrl();
  }

  const incompleteModal = document.getElementById('incompleteModal');
  const modalConfirmBtn = document.getElementById('modalConfirm');
  const modalGoBackBtn = document.getElementById('modalGoBack');

  function isModalOpen() {
    return incompleteModal && incompleteModal.classList.contains('is-open');
  }

  function openIncompleteModal() {
    if (!incompleteModal) return;
    incompleteModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeIncompleteModal() {
    if (!incompleteModal) return;
    incompleteModal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeIncompleteModal();
      finalizeCompletion();
    });
  }

  if (modalGoBackBtn) {
    modalGoBackBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeIncompleteModal();
    });
  }

  if (incompleteModal) {
    incompleteModal.addEventListener('click', (e) => {
      if (e.target === incompleteModal) closeIncompleteModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalOpen()) closeIncompleteModal();
    });
  }

  completeBtn.addEventListener('click', () => {
    if (isCompleted()) return;
    const done = requiredCheckboxes.filter((cb) => cb.checked).length;
    if (done < requiredCheckboxes.length) {
      openIncompleteModal();
      return;
    }
    finalizeCompletion();
  });

  loadState();
  updateProgress();
  restoreTaskMarkers();
})();
