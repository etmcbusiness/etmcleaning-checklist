(function () {
  const page = document.querySelector('.checklist-page');
  if (!page) return;

  const storageKey = page.dataset.storageKey || 'checklist-default';
  const completedKey = storageKey + ':completedAt';
  const startedKey = storageKey + ':startedAt';
  const accumulatedKey = storageKey + ':accumulatedMs';
  const logKey = storageKey + ':log';
  const taskTimingsKey = storageKey + ':taskTimings';
  const milestonesKey = storageKey + ':milestones';

  // ---------- Sounds ----------
  // Drop matching files into the /sounds folder; missing files are silently skipped.
  const SOUND_FILES = {
    task: 'sounds/task.mp3',
    milestone25: 'sounds/milestone-25.mp3',
    milestone50: 'sounds/milestone-50.mp3',
    milestone75: 'sounds/milestone-75.mp3',
    milestone100: 'sounds/milestone-100.mp3'
  };
  const sounds = {};
  Object.keys(SOUND_FILES).forEach((k) => {
    if (k === 'task') return;
    try {
      const a = new Audio(SOUND_FILES[k]);
      a.preload = 'auto';
      sounds[k] = a;
    } catch (e) { /* ignore */ }
  });

  /** Several decoders so rapid checkmarks each get a audible tap (one shared Audio retiggers too fast). */
  const TASK_SOUND_POOL_SIZE = 4;
  const taskSoundPool = [];
  (function initTaskSoundPool() {
    const url = SOUND_FILES.task;
    if (!url) return;
    for (let i = 0; i < TASK_SOUND_POOL_SIZE; i++) {
      try {
        const a = new Audio(url);
        a.preload = 'auto';
        taskSoundPool.push(a);
      } catch (e) { /* ignore */ }
    }
  })();
  let taskSoundPoolIndex = 0;

  function playSound(name) {
    if (name === 'task' && taskSoundPool.length) {
      const s = taskSoundPool[taskSoundPoolIndex % taskSoundPool.length];
      taskSoundPoolIndex++;
      try {
        s.pause();
        s.currentTime = 0;
        const p = s.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
      } catch (e) { /* ignore */ }
      return;
    }
    const s = sounds[name];
    if (!s) return;
    try {
      s.currentTime = 0;
      const p = s.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* ignore autoplay errors */ });
    } catch (e) { /* ignore */ }
  }

  // ---------- Milestones ----------
  const MILESTONE_LEVELS = [25, 50, 75, 100];
  const MILESTONE_CONFIG = {
    25:  { sound: 'milestone25',  text: 'Good Job Getting Started!',     cls: 'lvl-25' },
    50:  { sound: 'milestone50',  text: 'Half Way There!',               cls: 'lvl-50' },
    75:  { sound: 'milestone75',  text: 'Almost Done!',                  cls: 'lvl-75' },
    100: { sound: 'milestone100', text: 'Cleaning Completed! Good Work!', cls: 'lvl-100' }
  };
  const milestoneBanner = document.getElementById('milestoneBanner');
  const milestoneCard = document.getElementById('milestoneCard');
  const milestoneText = document.getElementById('milestoneText');
  let milestoneTimeout = null;

  function readMilestonesHit() {
    try {
      const raw = localStorage.getItem(milestonesKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeMilestonesHit(arr) {
    localStorage.setItem(milestonesKey, JSON.stringify(arr));
  }

  function showMilestone(level) {
    const cfg = MILESTONE_CONFIG[level];
    if (!cfg) return;
    if (cfg.sound) playSound(cfg.sound);
    if (!milestoneBanner || !milestoneCard || !milestoneText) return;

    milestoneText.textContent = cfg.text;
    milestoneCard.className = 'milestone-card ' + cfg.cls;
    milestoneBanner.className = 'milestone-banner ' + cfg.cls;
    milestoneBanner.hidden = false;

    milestoneCard.style.animation = 'none';
    void milestoneCard.offsetWidth;
    milestoneCard.style.animation = '';

    if (milestoneTimeout) clearTimeout(milestoneTimeout);
    milestoneTimeout = setTimeout(() => {
      if (milestoneBanner) milestoneBanner.hidden = true;
    }, 1900);
  }

  function syncMilestones(newPct) {
    let hit = readMilestonesHit();
    let toFire = null;
    MILESTONE_LEVELS.forEach((lvl) => {
      const wasHit = hit.indexOf(lvl) !== -1;
      if (newPct >= lvl && !wasHit) {
        hit.push(lvl);
        if (toFire === null || lvl > toFire) toFire = lvl;
      } else if (newPct < lvl && wasHit) {
        hit = hit.filter((l) => l !== lvl);
      }
    });
    writeMilestonesHit(hit);
    if (toFire !== null) showMilestone(toFire);
    return toFire !== null;
  }

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
  const timerAvgLine = document.getElementById('timerAvgLine');
  const nextTaskHint = document.getElementById('nextTaskHint');
  let timerInterval = null;

  // ---------- After photos / videos (draft in IndexedDB; copied to log on complete) ----------
  const photoInput = document.getElementById('photoInput');
  const photoCount = document.getElementById('photoCount');
  const photoThumbs = document.getElementById('photoThumbs');
  const photoUploadStatus = document.getElementById('photoUploadStatus');
  const photoUploadGroup = page.querySelector('.photo-upload-group');
  let photoThumbUrls = [];
  let photoStatusTimer = null;

  function formatIdbError(err) {
    if (!err) return 'Could not save. Please try again.';
    const name = err.name || '';
    const msg = String(err.message || '');
    if (name === 'QuotaExceededError' || /quota/i.test(msg) || err.code === 22) {
      return 'Storage is full. Free space on the device or remove attachments from older log entries, then try again.';
    }
    return 'Could not save: ' + (msg || 'Please try again.');
  }

  function setPhotoImportBusy(busy) {
    if (photoUploadGroup) photoUploadGroup.classList.toggle('is-adding', !!busy);
    if (photoInput && busy) photoInput.disabled = true;
  }

  function showPhotoStatus(text, kind) {
    if (!photoUploadStatus || !text) return;
    if (photoStatusTimer) {
      clearTimeout(photoStatusTimer);
      photoStatusTimer = null;
    }
    photoUploadStatus.hidden = false;
    photoUploadStatus.textContent = text;
    photoUploadStatus.className = 'photo-upload-status photo-upload-status--' + kind;
    if (kind === 'success') {
      photoStatusTimer = setTimeout(() => {
        photoUploadStatus.hidden = true;
        photoUploadStatus.textContent = '';
        photoUploadStatus.className = 'photo-upload-status';
      }, 2600);
    }
  }

  function revokePhotoThumbUrls() {
    photoThumbUrls.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch (e) { /* ignore */ }
    });
    photoThumbUrls = [];
  }

  function renderPhotoThumbs(photos) {
    if (!photoThumbs || !window.EtmMediaDB) return;
    revokePhotoThumbUrls();
    photoThumbs.innerHTML = '';
    const M = window.EtmMediaDB;
    photos.forEach((p) => {
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb';
      const url = URL.createObjectURL(p.blob);
      photoThumbUrls.push(url);
      if (M.isVideoItem(p)) {
        const vid = document.createElement('video');
        vid.src = url;
        vid.muted = true;
        vid.playsInline = true;
        vid.setAttribute('preload', 'metadata');
        wrap.appendChild(vid);
      } else {
        const img = document.createElement('img');
        img.src = url;
        img.alt = p.name ? String(p.name) : 'Photo';
        img.loading = 'lazy';
        wrap.appendChild(img);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'photo-thumb-remove';
      del.setAttribute('aria-label', 'Remove');
      del.innerHTML = '&times;';
      del.addEventListener('click', () => {
        M.loadDraft(storageKey)
          .then((list) => list.filter((x) => x.id !== p.id))
          .then((next) => M.saveDraft(storageKey, next))
          .then(() => refreshPhotosUi())
          .catch(() => {
            showPhotoStatus('Could not remove that item.', 'error');
          });
      });
      wrap.appendChild(del);
      photoThumbs.appendChild(wrap);
    });
  }

  function refreshPhotosUi() {
    if (!photoCount || !window.EtmMediaDB) return Promise.resolve();
    const M = window.EtmMediaDB;
    return M.loadDraft(storageKey).then((photos) => {
      photoCount.textContent = photos.length + '/' + M.MAX_ITEMS;
      if (photoInput) photoInput.disabled = photos.length >= M.MAX_ITEMS;
      renderPhotoThumbs(photos);
    });
  }

  function initPhotoUpload() {
    if (!photoInput) return;
    if (!window.EtmMediaDB || !window.indexedDB) {
      photoInput.disabled = true;
      if (photoCount) photoCount.textContent = '\u2014';
      showPhotoStatus('Attachments need a browser with IndexedDB enabled.', 'error');
      return;
    }
    const M = window.EtmMediaDB;
    const finishBusy = () => {
      setPhotoImportBusy(false);
      return refreshPhotosUi();
    };
    photoInput.addEventListener('change', () => {
      const pickedFiles = Array.from(photoInput.files || []);
      photoInput.value = '';
      if (!pickedFiles.length) return;
      const picked = pickedFiles.length;
      setPhotoImportBusy(true);
      showPhotoStatus('Adding\u2026', 'info');
      M.loadDraft(storageKey)
        .then((existing) => {
          const before = existing.length;
          return M.appendMediaFiles(existing, pickedFiles).then((photos) => ({
            photos,
            before
          }));
        })
        .then(({ photos, before }) =>
          M.saveDraft(storageKey, photos).then(() => ({ photos, before }))
        )
        .then(({ photos, before }) =>
          finishBusy().then(() => {
            if (picked > 0 && photos.length === before) {
              showPhotoStatus(
                'No files could be added. Try another image or choose from your photo library.',
                'error'
              );
            } else {
              showPhotoStatus('Saved', 'success');
              try {
                if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
              } catch (err) { /* ignore */ }
              const last = photoThumbs && photoThumbs.lastElementChild;
              if (last && typeof last.scrollIntoView === 'function') {
                last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
            }
          })
        )
        .catch((err) => {
          finishBusy().then(() => {
            showPhotoStatus(formatIdbError(err), 'error');
          });
        });
    });
  }
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
      if (completeBtn) {
        completeBtn.classList.remove('is-complete-ready');
      }
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

  function formatFriendlyDurationMs(ms) {
    if (ms < 0) ms = 0;
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return totalMin + ' min';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (m === 0) return h + 'h';
    return h + 'h ' + m + 'm';
  }

  function formatRoughMinutes(ms) {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m <= 0) return '0 min';
    if (m === 1) return '1 min';
    return m + ' min';
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
    updateTimerAvgHint();
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
      if (timerAvgLine) timerAvgLine.hidden = true;
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
      if (timerAvgLine) timerAvgLine.hidden = true;
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      return;
    }

    updateTimerAvgHint();

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

    const allRequiredDone = total > 0 && done === total;
    if (completeBtn && !isCompleted()) {
      completeBtn.classList.toggle('is-complete-ready', allRequiredDone);
      completeBtn.setAttribute(
        'aria-label',
        allRequiredDone ? 'Mark complete — all tasks done' : 'Mark complete'
      );
    }

    updateSectionChips();
    updateNextTaskHint();
    updateCancelBar();

    return pct;
  }

  const cancelCleaningBar = document.getElementById('cancelCleaningBar');
  const cancelCleaningBtn = document.getElementById('cancelCleaningBtn');

  function canCancelCleaningSession() {
    if (!hasSession() || isCompleted()) return false;
    return requiredCheckboxes.every((cb) => !cb.checked);
  }

  function updateCancelBar() {
    if (!cancelCleaningBar) return;
    cancelCleaningBar.hidden = !canCancelCleaningSession();
  }

  function cancelCleaningSession() {
    localStorage.removeItem(startedKey);
    localStorage.removeItem(accumulatedKey);
    localStorage.removeItem(completedKey);
    localStorage.removeItem(taskTimingsKey);
    localStorage.removeItem(milestonesKey);
    localStorage.removeItem(storageKey);
    checkboxes.forEach((cb) => {
      cb.checked = false;
      updateRow(cb);
    });
    if (window.EtmMediaDB) {
      window.EtmMediaDB.clearDraft(storageKey).catch(() => {});
    }
    banner.hidden = true;
    let homeUrl = 'index.html';
    try {
      homeUrl = new URL('index.html', window.location.href).href;
    } catch (e) { /* use default */ }
    window.location.replace(homeUrl);
  }

  function initSectionTitleRows() {
    page.querySelectorAll('.task-group:not(.notes-group):not(.photo-upload-group)').forEach((section) => {
      const h2 = Array.from(section.children).find((el) => el.tagName === 'H2');
      if (!h2 || h2.closest('.task-group-title-row')) return;
      const row = document.createElement('div');
      row.className = 'task-group-title-row';
      h2.replaceWith(row);
      row.appendChild(h2);
      const chip = document.createElement('span');
      chip.className = 'section-chip';
      chip.setAttribute('aria-label', 'Section progress');
      row.appendChild(chip);
    });
  }

  function updateSectionChips() {
    page.querySelectorAll('.task-group:not(.notes-group):not(.photo-upload-group)').forEach((section) => {
      const chip = section.querySelector('.section-chip');
      if (!chip) return;
      const boxes = Array.from(section.querySelectorAll('.task-list input[type="checkbox"]'));
      if (!boxes.length) {
        chip.textContent = '';
        chip.hidden = true;
        return;
      }
      const done = boxes.filter((cb) => cb.checked).length;
      chip.hidden = false;
      chip.textContent = done + '/' + boxes.length;
    });
  }

  function getSectionHeadingText(section) {
    if (!section) return '';
    const h2 = section.querySelector('.task-group-title-row h2') || section.querySelector('h2');
    return h2 ? h2.textContent.trim() : '';
  }

  function updateNextTaskHint() {
    if (!nextTaskHint) return;
    if (isCompleted()) {
      nextTaskHint.textContent = '';
      return;
    }
    const next = requiredCheckboxes.find((cb) => !cb.checked);
    if (!next) {
      nextTaskHint.textContent = 'Next: All required tasks done — ready when you are.';
      return;
    }
    const section = next.closest('.task-group');
    const title = getSectionHeadingText(section);
    nextTaskHint.textContent = 'Next: ' + (title || 'Task');
  }

  function updateTimerAvgHint() {
    if (!timerAvgLine) return;
    if (!hasSession() || isCompleted()) {
      timerAvgLine.hidden = true;
      return;
    }
    const log = readFullLog();
    if (!log.length) {
      timerAvgLine.hidden = true;
      return;
    }
    const avgMs = log.reduce((s, e) => s + (e.elapsedMs || 0), 0) / log.length;
    const cur = getElapsedMs();
    const diffMs = cur - avgMs;
    if (Math.abs(diffMs) < 20000) {
      timerAvgLine.textContent = 'On pace with your average';
    } else if (diffMs < 0) {
      timerAvgLine.textContent = formatRoughMinutes(diffMs) + ' under your average';
    } else {
      timerAvgLine.textContent = formatRoughMinutes(diffMs) + ' over your average';
    }
    timerAvgLine.hidden = false;
  }

  function getTaskText(checkbox) {
    const label = checkbox.closest('label');
    let span = null;
    if (label) {
      const children = Array.from(label.children);
      span = children.find(
        (el) => el.tagName === 'SPAN' && !el.classList.contains('task-timing-cluster')
      ) || null;
    }
    if (!span) {
      span = checkbox.parentElement && checkbox.parentElement.querySelector('span');
    }
    if (!span || span.classList.contains('task-timing-cluster')) return 'Task';
    let text = '';
    span.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        text += node.textContent;
      }
    });
    text = text.replace(/\s+/g, ' ').trim();
    return text || span.textContent.replace(/\s+/g, ' ').trim();
  }

  function normalizeTaskText(str) {
    return String(str || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function countFasterTasksThanLastLog(currentTasks, lastEntry) {
    if (!lastEntry || !lastEntry.tasks || !currentTasks.length) return null;
    const prevByIdx = new Map();
    const prevByText = new Map();
    lastEntry.tasks.forEach((t) => {
      if (typeof t.durationMs !== 'number') return;
      if (t.idx != null) prevByIdx.set(Number(t.idx), t.durationMs);
      if (t.text) prevByText.set(normalizeTaskText(t.text), t.durationMs);
    });
    let faster = 0;
    currentTasks.forEach((t) => {
      if (t.optional) return;
      let prevD = null;
      if (t.idx != null && prevByIdx.has(Number(t.idx))) prevD = prevByIdx.get(Number(t.idx));
      else if (t.text && prevByText.has(normalizeTaskText(t.text))) {
        prevD = prevByText.get(normalizeTaskText(t.text));
      }
      if (prevD == null) return;
      if (typeof t.durationMs === 'number' && t.durationMs < prevD) faster++;
    });
    return faster;
  }

  function buildSessionSummaryBeforeLog(completedAt) {
    const startedAt = Number(localStorage.getItem(startedKey)) || 0;
    const accumulated = Number(localStorage.getItem(accumulatedKey)) || 0;
    let elapsedMs;
    if (startedAt) {
      elapsedMs = accumulated + (completedAt - startedAt);
    } else {
      elapsedMs = accumulated;
    }

    const requiredDone = requiredCheckboxes.filter((cb) => cb.checked).length;
    const tasks = readTaskTimings();
    const sortedLog = readFullLog().slice().sort(
      (a, b) => (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0)
    );
    const lastEntry = sortedLog[0] || null;
    const faster = countFasterTasksThanLastLog(tasks, lastEntry);

    let msg = 'Great job — ' + formatFriendlyDurationMs(elapsedMs) + ', ' + requiredDone + ' task';
    if (requiredDone !== 1) msg += 's';
    if (faster !== null && faster > 0 && lastEntry) {
      msg += ', ' + faster + ' faster than last time';
    }
    msg += '.';
    return msg;
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

  function readFullLog() {
    try {
      const raw = localStorage.getItem(logKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  let previousDurationMapCache = null;
  function getPreviousDurationMaps() {
    if (previousDurationMapCache) return previousDurationMapCache;
    const log = readFullLog()
      .filter((e) => e.tasks && e.tasks.length)
      .sort((a, b) => (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0));
    const byIdx = new Map();
    const byText = new Map();
    if (log.length > 0) {
      log[0].tasks.forEach((t) => {
        const d = typeof t.durationMs === 'number' ? t.durationMs : null;
        if (d == null || d < 0) return;
        if (t.idx != null) byIdx.set(Number(t.idx), d);
        if (t.text) byText.set(normalizeTaskText(t.text), d);
      });
    }
    previousDurationMapCache = { byIdx: byIdx, byText: byText };
    return previousDurationMapCache;
  }

  function invalidatePreviousDurationCache() {
    previousDurationMapCache = null;
  }

  function getPrevDurationMsForIdx(idx) {
    const cb = checkboxes[idx];
    if (!cb) return null;
    const maps = getPreviousDurationMaps();
    if (maps.byIdx.has(idx)) return maps.byIdx.get(idx);
    const text = normalizeTaskText(getTaskText(cb));
    if (text && maps.byText.has(text)) return maps.byText.get(text);
    return null;
  }

  function getCurrentSessionDurationForIdx(idx) {
    const t = readTaskTimings().find((x) => Number(x.idx) === Number(idx));
    if (!t || typeof t.durationMs !== 'number') return null;
    return t.durationMs;
  }

  function removeTimingClusterFromLabel(label) {
    const cluster = label.querySelector('.task-timing-cluster');
    if (cluster) cluster.remove();
    const orphan = label.querySelector('.task-duration-marker');
    if (orphan) orphan.remove();
  }

  function ensureTimingCluster(label) {
    let cluster = label.querySelector('.task-timing-cluster');
    if (!cluster) {
      cluster = document.createElement('span');
      cluster.className = 'task-timing-cluster';
      const prev = document.createElement('span');
      prev.className = 'task-duration-prev';
      prev.setAttribute('hidden', '');
      const cur = document.createElement('span');
      cur.className = 'task-duration-marker';
      cluster.appendChild(prev);
      cluster.appendChild(cur);
      label.appendChild(cluster);
    }
    return {
      cluster: cluster,
      prevEl: cluster.querySelector('.task-duration-prev'),
      curEl: cluster.querySelector('.task-duration-marker')
    };
  }

  function updateTaskTimingUi(idx) {
    const cb = checkboxes[idx];
    if (!cb) return;
    const label = cb.closest('label');
    if (!label) return;

    const prevMs = getPrevDurationMsForIdx(idx);
    const curMs = getCurrentSessionDurationForIdx(idx);

    if (prevMs == null && curMs == null) {
      removeTimingClusterFromLabel(label);
      return;
    }

    const existingCluster = label.querySelector('.task-timing-cluster');
    if (!existingCluster) {
      const oldMarker = label.querySelector('.task-duration-marker');
      if (oldMarker) oldMarker.remove();
    }

    const timing = ensureTimingCluster(label);

    if (prevMs != null) {
      timing.prevEl.innerHTML =
        '<span class="task-duration-prev-label">Previous</span>' +
        '<span class="task-duration-prev-time">' + formatShortDuration(prevMs) + '</span>';
      timing.prevEl.removeAttribute('hidden');
      timing.prevEl.title = 'Time for this task on the last completed cleaning';
    } else {
      timing.prevEl.innerHTML = '';
      timing.prevEl.setAttribute('hidden', '');
      timing.prevEl.removeAttribute('title');
    }

    if (curMs != null) {
      timing.curEl.textContent = formatShortDuration(curMs);
      timing.curEl.removeAttribute('hidden');
    } else {
      timing.curEl.textContent = '';
      timing.curEl.setAttribute('hidden', '');
    }
  }

  function rebuildAllTaskTimingUi() {
    invalidatePreviousDurationCache();
    checkboxes.forEach((_, idx) => {
      updateTaskTimingUi(idx);
    });
  }

  function recordTaskCheck(idx, isChecked) {
    if (isCompleted()) {
      updateTaskTimingUi(idx);
      return;
    }
    if (!hasSession()) {
      updateTaskTimingUi(idx);
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
    }
    localStorage.setItem(taskTimingsKey, JSON.stringify(timings));
    updateTaskTimingUi(idx);
  }

  checkboxes.forEach((cb, idx) => {
    cb.addEventListener('change', () => {
      updateRow(cb);
      const newPct = updateProgress();
      saveState();
      recordTaskCheck(idx, cb.checked);

      if (cb.checked) {
        try {
          if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
        } catch (err) { /* ignore */ }
        playSound('task');
      }
      syncMilestones(newPct);
      updateTimerAvgHint();
    });
  });

  notesEls.forEach((el) => {
    el.addEventListener('input', saveState);
  });

  initPhotoUpload();

  if (cancelCleaningBtn) {
    cancelCleaningBtn.addEventListener('click', () => {
      cancelCleaningSession();
    });
  }

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
    localStorage.removeItem(milestonesKey);
    banner.hidden = true;
    updateProgress();
    initTimer();
    rebuildAllTaskTimingUi();
    updateTimerAvgHint();
    if (window.EtmMediaDB) {
      window.EtmMediaDB.clearDraft(storageKey).then(() => refreshPhotosUi()).catch(() => refreshPhotosUi());
    }
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
    const summaryText = buildSessionSummaryBeforeLog(now);
    appendLogEntry(now);

    function finishCleanupAndModal() {
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
      localStorage.removeItem(milestonesKey);

      if (carryNotes.trim() && currentNoteEl) {
        localStorage.setItem(noteStorageKey(currentNoteEl), carryNotes);
      }

      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      showCompletionSummary(summaryText);
    }

    if (window.EtmMediaDB) {
      window.EtmMediaDB.migrateDraftToLog(storageKey, now).catch(() => {}).then(finishCleanupAndModal);
    } else {
      finishCleanupAndModal();
    }
  }

  function showCompletionSummary(message) {
    const summaryModal = document.getElementById('summaryModal');
    const summaryMessage = document.getElementById('summaryMessage');
    const summaryContinueBtn = document.getElementById('summaryContinueBtn');
    if (!summaryModal || !summaryMessage || !summaryContinueBtn) {
      window.location.href = getBackUrl();
      return;
    }
    summaryMessage.textContent = message;
    summaryModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const go = () => {
      summaryModal.classList.remove('is-open');
      document.body.style.overflow = '';
      summaryContinueBtn.removeEventListener('click', go);
      window.location.href = getBackUrl();
    };
    summaryContinueBtn.addEventListener('click', go);
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

  function refreshTaskMarkerPreviousTimes() {
    rebuildAllTaskTimingUi();
  }
  window.addEventListener('focus', refreshTaskMarkerPreviousTimes);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshTaskMarkerPreviousTimes();
  });

  loadState();
  initSectionTitleRows();
  updateProgress();
  rebuildAllTaskTimingUi();
  refreshPhotosUi();
})();
