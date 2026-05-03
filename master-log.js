(function () {
  const page = document.querySelector('.log-page[data-master-log="true"]');
  if (!page) return;

  const LOG_SUFFIX = ':log';

  const LOCATION_LABELS = {
    'checklist-ramsey-rd': 'Thrift at the Warehouse: Ramsey',
    'checklist-warehouse': 'Thrift at the Warehouse: Warehouse',
    'checklist-capital-eye-care': 'Capital Eye Care',
    'checklist-belterra-eye-care': 'Belterra Eye Care',
    'checklist-the-commune': 'The Commune',
    'checklist-innerhouse': 'Innerhouse',
    'checklist-tanuki-games': 'Tanuki Games (Janitorial)',
    'checklist-advanced-eye-care-surgery': 'Advanced Eye Care and Surgery',
    'checklist-innovative-eye-care': 'Innovative Eye Care',
    'checklist-bastrop-family-eye-care': 'Bastrop Family Eye Care',
    'checklist-tanuki-games-windows': 'Tanuki Games (Windows)',
    'checklist-lush-6th-st': 'Lush: 6th St',
    'checklist-lush-domain': 'Lush: Domain',
    'checklist-mreyedr-congress': 'MrEyeDr: Congress'
  };

  function locationLabel(sourceKey) {
    if (LOCATION_LABELS[sourceKey]) return LOCATION_LABELS[sourceKey];
    const m = String(sourceKey || '').match(/^checklist-(.+)$/);
    return m ? m[1].replace(/-/g, ' ') : (sourceKey || 'Location');
  }

  function listLogSourceKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || !full.endsWith(LOG_SUFFIX)) continue;
      if (!full.startsWith('checklist-')) continue;
      keys.push(full.slice(0, -LOG_SUFFIX.length));
    }
    return keys;
  }

  function stripMeta(entry) {
    const o = Object.assign({}, entry);
    delete o._sourceStorageKey;
    return o;
  }

  function readLogFromSource(sourceKey) {
    try {
      const raw = localStorage.getItem(sourceKey + LOG_SUFFIX);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeLogToSource(sourceKey, log) {
    localStorage.setItem(sourceKey + LOG_SUFFIX, JSON.stringify(log));
  }

  function readAllLogsMerged() {
    const keys = listLogSourceKeys();
    const out = [];
    keys.forEach((sk) => {
      readLogFromSource(sk).forEach((entry) => {
        out.push(Object.assign({}, entry, { _sourceStorageKey: sk }));
      });
    });
    out.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    return out;
  }

  function rowKey(sourceKey, completedAt) {
    return String(sourceKey) + '\t' + Number(completedAt);
  }

  const tableWrap = document.getElementById('logTableWrap');
  const tbody = document.getElementById('logBody');
  const emptyEl = document.getElementById('logEmpty');
  const summaryEl = document.getElementById('logSummary');
  const clearBtn = document.getElementById('clearLogBtn');
  const exportBtn = document.getElementById('exportLogBtn');

  let editingId = null;
  const expandedIds = new Set();

  const galleryBackdrop = document.getElementById('galleryModal');
  const galleryStage = document.getElementById('galleryStage');
  const galleryCloseBtn = document.getElementById('galleryClose');
  const galleryPrevBtn = document.getElementById('galleryPrev');
  const galleryNextBtn = document.getElementById('galleryNext');
  const galleryCounterEl = document.getElementById('galleryCounter');

  let galleryItems = [];
  let galleryIndex = 0;
  const galleryObjectUrls = [];

  let editingMediaItems = null;
  let editMediaPromise = null;

  // ---------- Custom confirm modal ----------
  const confirmModal = document.getElementById('confirmModal');
  const confirmTitleEl = document.getElementById('confirmTitle');
  const confirmMessageEl = document.getElementById('confirmMessage');
  const confirmOkBtn = document.getElementById('confirmOk');
  const confirmCancelBtn = document.getElementById('confirmCancel');
  let confirmResolver = null;

  function showConfirm(opts) {
    return new Promise((resolve) => {
      confirmTitleEl.textContent = opts.title || 'Confirm';
      confirmMessageEl.textContent = opts.message || '';
      confirmOkBtn.textContent = opts.confirmLabel || 'Confirm';
      confirmCancelBtn.textContent = opts.cancelLabel || 'Cancel';
      if (opts.danger === false) {
        confirmOkBtn.classList.remove('modal-danger');
      } else {
        confirmOkBtn.classList.add('modal-danger');
      }
      confirmModal.classList.add('is-open');
      confirmResolver = resolve;
    });
  }

  function closeConfirm(result) {
    confirmModal.classList.remove('is-open');
    if (confirmResolver) {
      const r = confirmResolver;
      confirmResolver = null;
      r(result);
    }
  }

  confirmOkBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeConfirm(true);
  });
  confirmCancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeConfirm(false);
  });
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirm(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const logNotesEl = document.getElementById('logNotesModal');
    if (logNotesEl && logNotesEl.classList.contains('is-open')) {
      e.preventDefault();
      closeLogNotesModal();
      return;
    }
    if (galleryBackdrop && galleryBackdrop.classList.contains('is-open')) {
      e.preventDefault();
      closeGallery();
      return;
    }
    if (confirmModal.classList.contains('is-open')) {
      closeConfirm(false);
    }
  });

  // ---------- Formatting helpers ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatElapsed(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function formatShortDuration(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  }

  function parseDurationStr(str) {
    if (!str) return 0;
    const t = String(str).trim();
    if (!t) return 0;
    const parts = t.split(':');
    if (parts.length === 1) {
      const n = parseInt(parts[0], 10);
      return isNaN(n) ? 0 : Math.max(0, n) * 1000;
    }
    if (parts.length === 2) {
      const m = Math.max(0, parseInt(parts[0], 10) || 0);
      const s = Math.max(0, parseInt(parts[1], 10) || 0);
      return (m * 60 + s) * 1000;
    }
    if (parts.length === 3) {
      const h = Math.max(0, parseInt(parts[0], 10) || 0);
      const m = Math.max(0, parseInt(parts[1], 10) || 0);
      const s = Math.max(0, parseInt(parts[2], 10) || 0);
      return (h * 3600 + m * 60 + s) * 1000;
    }
    return 0;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit'
    });
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  /** Week is Monday–Sunday in local time; range is that week's Mon 00:00:00–Sun 23:59:59.999. */
  function startOfWeekMondayMs(d) {
    const day = d.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday, 0, 0, 0, 0);
    return mon.getTime();
  }

  function endOfWeekSundayMs(d) {
    const start = startOfWeekMondayMs(d);
    const sun = new Date(start);
    sun.setDate(sun.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return sun.getTime();
  }

  function startOfCalendarMonthMs(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
  }

  function endOfCalendarMonthMs(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  }

  function sumElapsedCompletedInRange(entries, rangeStartMs, rangeEndMs) {
    return entries.reduce((sum, e) => {
      const ca = Number(e.completedAt) || 0;
      if (ca >= rangeStartMs && ca <= rangeEndMs) {
        return sum + (Number(e.elapsedMs) || 0);
      }
      return sum;
    }, 0);
  }

  function toDatetimeLocal(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNoteBody(text) {
    if (!text) return '';
    return escapeHtml(String(text)).replace(/\r\n|\r|\n/g, '<br />');
  }

  function buildNotesSection(entry) {
    const cur = entry.notesCurrent && String(entry.notesCurrent).trim();
    const next = entry.notesForNext && String(entry.notesForNext).trim();
    if (!cur && !next) return '';
    let html = '<div class="log-notes-wrap">';
    if (cur) {
      html +=
        '<div class="log-notes-block">' +
        '<h4 class="log-notes-title">Notes (this visit)</h4>' +
        '<div class="log-notes-body">' +
        formatNoteBody(cur) +
        '</div></div>';
    }
    if (next) {
      html +=
        '<div class="log-notes-block">' +
        '<h4 class="log-notes-title">Notes for next cleaning</h4>' +
        '<div class="log-notes-body">' +
        formatNoteBody(next) +
        '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function entryHasNotes(entry) {
    const cur = entry.notesCurrent && String(entry.notesCurrent).trim();
    const next = entry.notesForNext && String(entry.notesForNext).trim();
    return !!(cur || next);
  }

  function revokeGalleryUrls() {
    while (galleryObjectUrls.length) {
      const u = galleryObjectUrls.pop();
      try {
        URL.revokeObjectURL(u);
      } catch (err) {}
    }
  }

  function closeGallery() {
    if (!galleryBackdrop) return;
    galleryBackdrop.classList.remove('is-open');
    galleryBackdrop.setAttribute('aria-hidden', 'true');
    revokeGalleryUrls();
    if (galleryStage) galleryStage.innerHTML = '';
    galleryItems = [];
  }

  function showGallerySlide() {
    if (!galleryStage || !galleryItems.length) return;
    revokeGalleryUrls();
    const p = galleryItems[galleryIndex];
    const url = URL.createObjectURL(p.blob);
    galleryObjectUrls.push(url);
    galleryStage.innerHTML = '';
    if (window.EtmMediaDB && window.EtmMediaDB.isVideoItem(p)) {
      const v = document.createElement('video');
      v.src = url;
      v.controls = true;
      v.setAttribute('playsinline', '');
      galleryStage.appendChild(v);
    } else {
      const im = document.createElement('img');
      im.src = url;
      im.alt = '';
      galleryStage.appendChild(im);
    }
    if (galleryCounterEl) {
      galleryCounterEl.textContent = galleryIndex + 1 + ' / ' + galleryItems.length;
    }
    if (galleryPrevBtn) galleryPrevBtn.disabled = galleryIndex <= 0;
    if (galleryNextBtn) galleryNextBtn.disabled = galleryIndex >= galleryItems.length - 1;
  }

  function openGallery(sourceKey, completedAt) {
    if (!window.EtmMediaDB || !galleryBackdrop) return;
    window.EtmMediaDB.loadLogPhotos(sourceKey, completedAt).then((items) => {
      if (!items.length) return;
      galleryItems = items;
      galleryIndex = 0;
      galleryBackdrop.classList.add('is-open');
      galleryBackdrop.setAttribute('aria-hidden', 'false');
      showGallerySlide();
    });
  }

  let logNotesModalEl = null;
  function closeLogNotesModal() {
    if (!logNotesModalEl) return;
    logNotesModalEl.classList.remove('is-open');
    logNotesModalEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function ensureLogNotesModal() {
    if (logNotesModalEl) return logNotesModalEl;
    const wrap = document.createElement('div');
    wrap.id = 'logNotesModal';
    wrap.className = 'modal-backdrop';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="modal log-notes-sheet" role="dialog" aria-modal="true" aria-labelledby="logNotesModalTitle">' +
      '<h2 id="logNotesModalTitle" class="log-notes-modal-title">Cleaning notes</h2>' +
      '<div class="log-notes-modal-body" id="logNotesModalBody"></div>' +
      '<div class="modal-actions modal-actions-single">' +
      '<button type="button" class="modal-btn modal-primary-solid" id="logNotesModalClose">Close</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    logNotesModalEl = wrap;
    wrap.querySelector('#logNotesModalClose').addEventListener('click', closeLogNotesModal);
    wrap.addEventListener('click', (ev) => {
      if (ev.target === wrap) closeLogNotesModal();
    });
    return wrap;
  }

  function openLogNotesModal(entry) {
    ensureLogNotesModal();
    const titleEl = document.getElementById('logNotesModalTitle');
    const bodyEl = document.getElementById('logNotesModalBody');
    if (!titleEl || !bodyEl) return;
    const loc = entry._sourceStorageKey ? locationLabel(entry._sourceStorageKey) : '';
    titleEl.textContent = loc
      ? ('Notes — ' + loc + ' — ' + formatDate(entry.completedAt))
      : ('Notes — ' + formatDate(entry.completedAt));
    const inner = buildNotesSection(entry);
    bodyEl.innerHTML = inner || '<p class="log-notes-modal-empty">No notes were saved for this visit.</p>';
    logNotesModalEl.classList.add('is-open');
    logNotesModalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function renderEditMediaThumbs(form) {
    const box = form.querySelector('.edit-media-thumbs');
    if (!box || !Array.isArray(editingMediaItems)) return;
    box.querySelectorAll('img, video').forEach((el) => {
      const u = el.getAttribute('src');
      if (u && u.indexOf('blob:') === 0) URL.revokeObjectURL(u);
    });
    box.innerHTML = '';
    editingMediaItems.forEach((p) => {
      const wrap = document.createElement('div');
      wrap.className = 'edit-media-thumb';
      const url = URL.createObjectURL(p.blob);
      if (window.EtmMediaDB && window.EtmMediaDB.isVideoItem(p)) {
        const v = document.createElement('video');
        v.src = url;
        v.muted = true;
        wrap.appendChild(v);
      } else {
        const im = document.createElement('img');
        im.src = url;
        im.alt = '';
        wrap.appendChild(im);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'edit-media-remove';
      btn.dataset.mid = p.id;
      btn.setAttribute('aria-label', 'Remove');
      btn.innerHTML = '\u00d7';
      wrap.appendChild(btn);
      box.appendChild(wrap);
    });
  }

  function hydrateLogMediaCounts(sorted) {
    if (!window.EtmMediaDB) return;
    sorted.forEach((entry) => {
      const eid = Number(entry.completedAt);
      const sk = entry._sourceStorageKey;
      const rk = rowKey(sk, eid);
      if (editingId === rk) return;
      if (!expandedIds.has(rk)) return;
      const selCount =
        '.log-media-count[data-source-key="' + sk + '"][data-log-media-at="' + eid + '"]';
      const selBtn =
        '.log-gallery-btn[data-source-key="' + sk + '"][data-completed-at="' + eid + '"]';
      const countEl = tbody.querySelector(selCount);
      const btn = tbody.querySelector(selBtn);
      if (!countEl || !btn) return;
      window.EtmMediaDB.loadLogPhotos(sk, eid).then((photos) => {
        countEl.textContent = String(photos.length);
        btn.hidden = photos.length === 0;
      });
    });
  }

  function revokeEditThumbsInTbody() {
    tbody.querySelectorAll('.edit-media-thumbs img, .edit-media-thumbs video').forEach((el) => {
      const u = el.getAttribute('src');
      if (u && u.indexOf('blob:') === 0) URL.revokeObjectURL(u);
    });
  }

  // ---------- Detail builders ----------
  function buildTaskBreakdownView(tasks) {
    if (!tasks || tasks.length === 0) {
      return '<div class="task-breakdown empty">No task timings recorded for this cleaning.</div>';
    }
    const sorted = tasks.slice().sort((a, b) => (a.elapsedMs || 0) - (b.elapsedMs || 0));
    let html = '<div class="task-breakdown">';
    html += '<div class="task-breakdown-head">' +
      '<span>Task</span>' +
      '<span class="col-dur">Duration</span>' +
      '<span class="col-cum">Total</span>' +
      '</div>';
    let prevMs = 0;
    sorted.forEach((t) => {
      const cumulative = Number(t.elapsedMs) || 0;
      const duration = typeof t.durationMs === 'number'
        ? t.durationMs
        : Math.max(0, cumulative - prevMs);
      prevMs = cumulative;
      html +=
        '<div class="task-row' + (t.optional ? ' optional' : '') + '">' +
          '<span class="task-name">' + escapeHtml(t.text || 'Task') +
            (t.optional ? ' <span class="task-tag">add-on</span>' : '') +
          '</span>' +
          '<span class="col-dur"><span class="duration-pill small">' + formatElapsed(duration) + '</span></span>' +
          '<span class="col-cum">' + formatElapsed(cumulative) + '</span>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  function buildEditForm(entry) {
    const sessionStart = entry.sessionStart || 0;
    const completedAt = entry.completedAt || 0;
    const src = entry._sourceStorageKey || '';
    const tasks = (entry.tasks || []).slice().sort(
      (a, b) => (a.elapsedMs || 0) - (b.elapsedMs || 0)
    );

    let html = '<div class="edit-form" data-id="' + completedAt + '" data-source-key="' + escapeHtml(src) + '">';
    html += '<div class="edit-fields">';
    html += '<label class="edit-field"><span>Started</span>' +
      '<input type="datetime-local" step="1" data-field="sessionStart" value="' +
      escapeHtml(toDatetimeLocal(sessionStart)) + '" /></label>';
    html += '<label class="edit-field"><span>Ended</span>' +
      '<input type="datetime-local" step="1" data-field="completedAt" value="' +
      escapeHtml(toDatetimeLocal(completedAt)) + '" /></label>';
    html += '</div>';

    if (tasks.length > 0) {
      html += '<div class="edit-tasks">';
      html += '<h3 class="edit-tasks-title">Task Durations <span class="hint">format: M:SS or H:MM:SS</span></h3>';
      let prevMs = 0;
      tasks.forEach((t, i) => {
        const dur = typeof t.durationMs === 'number'
          ? t.durationMs
          : Math.max(0, (Number(t.elapsedMs) || 0) - prevMs);
        prevMs = Number(t.elapsedMs) || 0;
        html += '<div class="edit-task-row' + (t.optional ? ' optional' : '') + '">' +
          '<span class="task-name">' + escapeHtml(t.text || 'Task') +
            (t.optional ? ' <span class="task-tag">add-on</span>' : '') +
          '</span>' +
          '<input type="text" class="duration-input" data-task-idx="' + i + '" ' +
          'value="' + escapeHtml(formatShortDuration(dur)) + '" placeholder="0:00" inputmode="numeric" />' +
          '</div>';
      });
      html += '</div>';
    } else {
      html += '<p class="edit-empty">No task timings were recorded for this cleaning.</p>';
    }

    html += '<div class="edit-media-block">';
    html += '<h3 class="edit-tasks-title">Photos &amp; videos <span class="hint">max 10</span></h3>';
    if (typeof window !== 'undefined' && window.EtmMediaDB) {
      html += '<input type="file" class="edit-media-input" accept="image/*,video/*" multiple />';
    } else {
      html += '<p class="edit-empty">Media attachments are not available in this browser.</p>';
    }
    html += '<div class="edit-media-thumbs"></div>';
    html += '</div>';

    html += '<div class="edit-actions">';
    html += '<button type="button" class="btn-secondary" data-action="cancel">Cancel</button>';
    html += '<button type="button" class="btn-primary" data-action="save">Save Changes</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildViewBody(entry) {
    const sk = entry._sourceStorageKey || '';
    const id = Number(entry.completedAt) || 0;
    const photosRow =
      '<div class="log-media-inline log-media-inline-detail" role="group" aria-label="Photos and videos">' +
        '<span class="log-media-label">Photos</span>' +
        '<span class="log-media-count" data-source-key="' + escapeHtml(sk) + '" data-log-media-at="' + id + '">\u2014</span>' +
        '<button type="button" class="log-gallery-btn" data-source-key="' + escapeHtml(sk) + '" data-completed-at="' + id + '" hidden>View photos</button>' +
      '</div>';
    return (
      '<div class="entry-actions">' +
        '<button type="button" class="entry-btn edit-btn" data-action="edit">&#9998; Edit</button>' +
        '<button type="button" class="entry-btn delete-btn" data-action="delete">&#10005; Delete</button>' +
      '</div>' +
      photosRow +
      buildNotesSection(entry) +
      buildTaskBreakdownView(entry.tasks)
    );
  }

  // ---------- Mutations ----------
  function deleteEntry(sourceKey, id) {
    showConfirm({
      title: 'Delete This Cleaning?',
      message: "This will permanently remove this entry from the log. This cannot be undone.",
      confirmLabel: 'Yes \u2014 Delete',
      cancelLabel: 'No \u2014 Keep It',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      const numId = Number(id);
      const log = readLogFromSource(sourceKey).filter((e) => Number(e.completedAt) !== numId);
      writeLogToSource(sourceKey, log);
      if (window.EtmMediaDB) {
        window.EtmMediaDB.deleteLogPhotos(sourceKey, numId).catch(() => {});
      }
      const k = rowKey(sourceKey, numId);
      expandedIds.delete(k);
      if (editingId === k) {
        editingId = null;
        editingMediaItems = null;
        editMediaPromise = null;
      }
      render();
    });
  }

  function saveEdit(sourceKey, originalId, formEl) {
    const id = Number(originalId);
    const log = readLogFromSource(sourceKey);
    const idx = log.findIndex((e) => Number(e.completedAt) === id);
    if (idx === -1) return;
    const entry = log[idx];

    const startInput = formEl.querySelector('[data-field="sessionStart"]');
    const endInput = formEl.querySelector('[data-field="completedAt"]');
    const newStart = new Date(startInput.value).getTime();
    const newEnd = new Date(endInput.value).getTime();

    if (isNaN(newStart) || isNaN(newEnd)) {
      alert('Please enter valid start and end times.');
      return;
    }
    if (newEnd < newStart) {
      alert('End time cannot be before start time.');
      return;
    }

    const taskInputs = formEl.querySelectorAll('.duration-input');
    const newTasks = (entry.tasks || []).slice().sort(
      (a, b) => (a.elapsedMs || 0) - (b.elapsedMs || 0)
    );
    let cumulative = 0;
    taskInputs.forEach((inp) => {
      const i = parseInt(inp.dataset.taskIdx, 10);
      if (newTasks[i]) {
        const durMs = parseDurationStr(inp.value);
        cumulative += durMs;
        newTasks[i] = Object.assign({}, newTasks[i], {
          durationMs: durMs,
          elapsedMs: cumulative
        });
      }
    });

    const oldCa = id;
    const newCa = Number(newEnd);

    log[idx] = stripMeta(Object.assign({}, entry, {
      sessionStart: newStart,
      completedAt: newEnd,
      elapsedMs: Math.max(0, newEnd - newStart),
      tasks: newTasks
    }));

    const oldKey = rowKey(sourceKey, oldCa);
    if (editingId === oldKey) editingId = null;
    expandedIds.delete(oldKey);
    expandedIds.add(rowKey(sourceKey, newCa));

    writeLogToSource(sourceKey, log);

    const mediaDone = () => {
      editingMediaItems = null;
      editMediaPromise = null;
      render();
    };

    const runMedia = () => {
      if (!window.EtmMediaDB) {
        mediaDone();
        return;
      }
      const items = Array.isArray(editingMediaItems) ? editingMediaItems : [];
      window.EtmMediaDB
        .saveLogPhotos(sourceKey, newCa, items)
        .then(() => {
          if (oldCa !== newCa) {
            return window.EtmMediaDB.deleteLogPhotos(sourceKey, oldCa);
          }
        })
        .then(mediaDone)
        .catch(mediaDone);
    };

    (editMediaPromise || Promise.resolve()).then(runMedia);
  }

  // ---------- Render ----------
  function render() {
    revokeEditThumbsInTbody();
    const log = readAllLogsMerged();

    if (log.length === 0) {
      tableWrap.hidden = true;
      emptyEl.hidden = false;
      summaryEl.textContent = '';
      clearBtn.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    tableWrap.hidden = false;
    clearBtn.hidden = false;

    const totalMs = log.reduce((sum, e) => sum + (e.elapsedMs || 0), 0);
    const avgMs = totalMs / log.length;
    const now = new Date();
    const monthStartMs = startOfCalendarMonthMs(now);
    const monthEndMs = endOfCalendarMonthMs(now);
    const weekStartMs = startOfWeekMondayMs(now);
    const weekEndMs = endOfWeekSundayMs(now);
    const totalMonthMs = sumElapsedCompletedInRange(log, monthStartMs, monthEndMs);
    const totalWeekMs = sumElapsedCompletedInRange(log, weekStartMs, weekEndMs);
    summaryEl.innerHTML =
      '<div class="summary-tile summary-tile-master summary-tile-master-cleanings"><span class="summary-num">' + log.length + '</span><span class="summary-label">Total Cleanings</span></div>' +
      '<div class="summary-tile summary-tile-master summary-tile-master-avg"><span class="summary-num">' + formatElapsed(avgMs) + '</span><span class="summary-label">Average Time</span></div>' +
      '<div class="summary-tile summary-tile-master summary-tile-master-month"><span class="summary-num">' + formatElapsed(totalMonthMs) + '</span><span class="summary-label">Total time this month</span></div>' +
      '<div class="summary-tile summary-tile-master summary-tile-master-week"><span class="summary-num">' + formatElapsed(totalWeekMs) + '</span><span class="summary-label">Total time this week</span></div>';

    const sorted = log.slice();
    tbody.innerHTML = '';

    sorted.forEach((entry) => {
      const id = Number(entry.completedAt);
      const sk = entry._sourceStorageKey;
      const rk = rowKey(sk, id);
      const isExpanded = expandedIds.has(rk) || editingId === rk;
      const isEditing = editingId === rk;

      const tr = document.createElement('tr');
      tr.className = 'log-row' + (isExpanded ? ' expanded' : '');
      tr.dataset.sourceKey = sk;
      tr.dataset.completedAt = String(id);
      tr.dataset.rowKey = rk;
      const sessionRange =
        formatTime(entry.sessionStart) + ' \u2013 ' + formatTime(entry.completedAt);
      tr.innerHTML =
        '<td data-label="Location">' + escapeHtml(locationLabel(sk)) + '</td>' +
        '<td data-label="Date">' + formatDate(entry.completedAt) + '</td>' +
        '<td data-label="Started – Ended">' + sessionRange + '</td>' +
        '<td data-label="Duration" class="td-duration-stack">' +
          '<div class="duration-stack">' +
            '<span class="duration-cell">' +
              '<span class="duration-pill">' + formatElapsed(entry.elapsedMs) + '</span>' +
              '<span class="expand-arrow" aria-hidden="true">&#9656;</span>' +
            '</span>' +
          '</div>' +
        '</td>' +
        '<td data-label="Notes" class="td-log-notes">' +
          (entryHasNotes(entry)
            ? '<button type="button" class="log-notes-btn" data-source-key="' + escapeHtml(sk) + '" data-log-notes-id="' + id + '">View notes</button>'
            : '<span class="log-notes-none">\u2014</span>') +
        '</td>';
      tbody.appendChild(tr);

      const detailsTr = document.createElement('tr');
      detailsTr.className = 'log-details';
      detailsTr.hidden = !isExpanded;
      detailsTr.dataset.sourceKey = sk;
      detailsTr.dataset.completedAt = String(id);
      detailsTr.dataset.rowKey = rk;
      const detailsCell = document.createElement('td');
      detailsCell.colSpan = 5;
      detailsCell.innerHTML = isEditing
        ? buildEditForm(entry)
        : buildViewBody(entry);
      detailsTr.appendChild(detailsCell);
      tbody.appendChild(detailsTr);
    });

    hydrateLogMediaCounts(sorted);
  }

  // ---------- Event delegation ----------
  tbody.addEventListener('click', (e) => {
    const notesBtn = e.target.closest('.log-notes-btn');
    if (notesBtn) {
      e.preventDefault();
      e.stopPropagation();
      const nid = Number(notesBtn.dataset.logNotesId);
      const nsk = notesBtn.dataset.sourceKey;
      const ent = readAllLogsMerged().find(
        (row) => row._sourceStorageKey === nsk && Number(row.completedAt) === nid
      );
      if (ent) openLogNotesModal(ent);
      return;
    }

    const galBtn = e.target.closest('.log-gallery-btn');
    if (galBtn) {
      e.preventDefault();
      e.stopPropagation();
      openGallery(galBtn.dataset.sourceKey, Number(galBtn.dataset.completedAt));
      return;
    }

    const rm = e.target.closest('.edit-media-remove');
    if (rm) {
      e.preventDefault();
      e.stopPropagation();
      const form = rm.closest('.edit-form');
      if (!form || !Array.isArray(editingMediaItems)) return;
      const mid = rm.dataset.mid;
      editingMediaItems = editingMediaItems.filter((x) => String(x.id) !== String(mid));
      renderEditMediaThumbs(form);
      return;
    }

    const row = e.target.closest('tr.log-row');
    if (row) {
      const sk = row.dataset.sourceKey;
      const id = Number(row.dataset.completedAt);
      const rk = rowKey(sk, id);
      const wasExpanded = expandedIds.has(rk) || editingId === rk;
      if (wasExpanded) {
        expandedIds.delete(rk);
        if (editingId === rk) {
          editingId = null;
          editingMediaItems = null;
          editMediaPromise = null;
        }
      } else {
        expandedIds.add(rk);
      }
      render();
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const detailsTr = actionBtn.closest('tr.log-details');
    if (!detailsTr) return;
    const sk = detailsTr.dataset.sourceKey;
    const id = Number(detailsTr.dataset.completedAt);
    const rk = rowKey(sk, id);
    const action = actionBtn.dataset.action;

    if (action === 'edit') {
      editingId = rk;
      expandedIds.add(rk);
      editingMediaItems = [];
      if (window.EtmMediaDB) {
        editMediaPromise = window.EtmMediaDB.loadLogPhotos(sk, id).then((photos) => {
          editingMediaItems = photos.map((p) => Object.assign({}, p));
          const form = tbody.querySelector(
            '.edit-form[data-id="' + id + '"][data-source-key="' + sk + '"]'
          );
          if (form) renderEditMediaThumbs(form);
          return editingMediaItems;
        });
      } else {
        editMediaPromise = Promise.resolve();
      }
      render();
    } else if (action === 'delete') {
      deleteEntry(sk, id);
    } else if (action === 'cancel') {
      editingId = null;
      editingMediaItems = null;
      editMediaPromise = null;
      render();
    } else if (action === 'save') {
      const form = actionBtn.closest('.edit-form');
      if (form) saveEdit(sk, form.dataset.id, form);
    }
  });

  tbody.addEventListener('change', (e) => {
    const inp = e.target.closest('.edit-media-input');
    if (!inp) return;
    const form = inp.closest('.edit-form');
    if (!form || !window.EtmMediaDB) return;
    if (!Array.isArray(editingMediaItems)) return;
    const pickedFiles = Array.from(inp.files || []);
    inp.value = '';
    if (!pickedFiles.length) return;
    window.EtmMediaDB.appendMediaFiles(editingMediaItems, pickedFiles).then((next) => {
      editingMediaItems = next;
      renderEditMediaThumbs(form);
    });
  });

  function exportLogJson() {
    const entries = readAllLogsMerged();
    const dbName = 'etm-checklist-photo-db';
    const keys = listLogSourceKeys();
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'ETM Checklist — combined cleaning log export',
      scope: 'all-locations',
      locationStorageKeys: keys,
      indexedDbName: dbName,
      note:
        'This JSON merges every location log in this browser. Each entry includes locationStorageKey. Photos/videos live in IndexedDB (' +
        dbName +
        '). Attachments use keys "<locationStorageKey>::log::<completedAt>" per entry.',
      entryCount: entries.length,
      entries: entries.map((e) => {
        const o = Object.assign({}, e);
        const loc = o._sourceStorageKey;
        delete o._sourceStorageKey;
        o.locationStorageKey = loc;
        return o;
      })
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cleaning-log-all-locations-' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportLogJson();
    });
  }

  if (clearBtn) clearBtn.addEventListener('click', () => {
    showConfirm({
      title: 'Clear Every Location Log?',
      message:
        'This will permanently remove ALL cleaning entries for every location and clear their saved photos/videos from this browser. This cannot be undone.',
      confirmLabel: 'Yes \u2014 Clear Everything',
      cancelLabel: 'No \u2014 Keep Logs',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      const keys = listLogSourceKeys();
      keys.forEach((sk) => {
        if (window.EtmMediaDB) {
          window.EtmMediaDB.clearAllMediaForStorageKey(sk).catch(() => {});
        }
        localStorage.removeItem(sk + LOG_SUFFIX);
      });
      expandedIds.clear();
      editingId = null;
      editingMediaItems = null;
      editMediaPromise = null;
      render();
    });
  });

  if (galleryCloseBtn) galleryCloseBtn.addEventListener('click', closeGallery);
  if (galleryBackdrop) {
    galleryBackdrop.addEventListener('click', (ev) => {
      if (ev.target === galleryBackdrop) closeGallery();
    });
  }
  if (galleryPrevBtn) {
    galleryPrevBtn.addEventListener('click', () => {
      if (galleryIndex > 0) {
        galleryIndex--;
        showGallerySlide();
      }
    });
  }
  if (galleryNextBtn) {
    galleryNextBtn.addEventListener('click', () => {
      if (galleryIndex < galleryItems.length - 1) {
        galleryIndex++;
        showGallerySlide();
      }
    });
  }

  render();
})();
