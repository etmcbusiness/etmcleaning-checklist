(function () {
  const page = document.querySelector('.log-page');
  if (!page) return;

  const storageKey = page.dataset.storageKey || 'checklist-default';
  const logKey = storageKey + ':log';

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
    if (galleryBackdrop && galleryBackdrop.classList.contains('is-open')) {
      e.preventDefault();
      closeGallery();
      return;
    }
    if (confirmModal.classList.contains('is-open')) {
      closeConfirm(false);
    }
  });

  // ---------- Storage helpers ----------
  function readLog() {
    try {
      const raw = localStorage.getItem(logKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeLog(log) {
    localStorage.setItem(logKey, JSON.stringify(log));
  }

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

  function openGallery(completedAt) {
    if (!window.EtmMediaDB || !galleryBackdrop) return;
    window.EtmMediaDB.loadLogPhotos(storageKey, completedAt).then((items) => {
      if (!items.length) return;
      galleryItems = items;
      galleryIndex = 0;
      galleryBackdrop.classList.add('is-open');
      galleryBackdrop.setAttribute('aria-hidden', 'false');
      showGallerySlide();
    });
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
      const countEl = tbody.querySelector('[data-log-media-count="' + eid + '"]');
      const btn = tbody.querySelector('.log-gallery-btn[data-completed-at="' + eid + '"]');
      if (!countEl || !btn) return;
      window.EtmMediaDB.loadLogPhotos(storageKey, eid).then((photos) => {
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
    const tasks = (entry.tasks || []).slice().sort(
      (a, b) => (a.elapsedMs || 0) - (b.elapsedMs || 0)
    );

    let html = '<div class="edit-form" data-id="' + completedAt + '">';
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
    return (
      '<div class="entry-actions">' +
        '<button type="button" class="entry-btn edit-btn" data-action="edit">&#9998; Edit</button>' +
        '<button type="button" class="entry-btn delete-btn" data-action="delete">&#10005; Delete</button>' +
      '</div>' +
      buildTaskBreakdownView(entry.tasks)
    );
  }

  // ---------- Mutations ----------
  function deleteEntry(id) {
    showConfirm({
      title: 'Delete This Cleaning?',
      message: "This will permanently remove this entry from the log. This cannot be undone.",
      confirmLabel: 'Yes \u2014 Delete',
      cancelLabel: 'No \u2014 Keep It',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      const log = readLog().filter((e) => Number(e.completedAt) !== Number(id));
      writeLog(log);
      if (window.EtmMediaDB) {
        window.EtmMediaDB.deleteLogPhotos(storageKey, id).catch(() => {});
      }
      expandedIds.delete(id);
      if (editingId === id) {
        editingId = null;
        editingMediaItems = null;
        editMediaPromise = null;
      }
      render();
    });
  }

  function saveEdit(id, formEl) {
    const log = readLog();
    const idx = log.findIndex((e) => Number(e.completedAt) === Number(id));
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

    const oldCa = Number(id);
    const newCa = Number(newEnd);

    log[idx] = Object.assign({}, entry, {
      sessionStart: newStart,
      completedAt: newEnd,
      elapsedMs: Math.max(0, newEnd - newStart),
      tasks: newTasks
    });

    if (editingId === id) editingId = null;
    expandedIds.delete(id);
    expandedIds.add(newCa);

    writeLog(log);

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
        .saveLogPhotos(storageKey, newCa, items)
        .then(() => {
          if (oldCa !== newCa) {
            return window.EtmMediaDB.deleteLogPhotos(storageKey, oldCa);
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
    const log = readLog();

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
    summaryEl.innerHTML =
      '<div class="summary-tile"><span class="summary-num">' + log.length + '</span><span class="summary-label">Total Cleanings</span></div>' +
      '<div class="summary-tile"><span class="summary-num">' + formatElapsed(avgMs) + '</span><span class="summary-label">Average Time</span></div>' +
      '<div class="summary-tile"><span class="summary-num">' + formatElapsed(totalMs) + '</span><span class="summary-label">Total Time</span></div>';

    const sorted = log.slice().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    tbody.innerHTML = '';

    sorted.forEach((entry) => {
      const id = Number(entry.completedAt);
      const isExpanded = expandedIds.has(id) || editingId === id;
      const isEditing = editingId === id;

      const tr = document.createElement('tr');
      tr.className = 'log-row' + (isExpanded ? ' expanded' : '');
      tr.dataset.id = id;
      tr.innerHTML =
        '<td data-label="Date">' + formatDate(entry.completedAt) + '</td>' +
        '<td data-label="Started">' + formatTime(entry.sessionStart) + '</td>' +
        '<td data-label="Ended">' + formatTime(entry.completedAt) + '</td>' +
        '<td data-label="Duration" class="td-duration-stack">' +
          '<div class="duration-stack">' +
            '<span class="duration-cell">' +
              '<span class="duration-pill">' + formatElapsed(entry.elapsedMs) + '</span>' +
              '<span class="expand-arrow" aria-hidden="true">&#9656;</span>' +
            '</span>' +
            '<div class="log-media-inline">' +
              '<span class="log-media-label">Photos</span>' +
              '<span class="log-media-count" data-log-media-count="' + id + '">\u2014</span>' +
              '<button type="button" class="log-gallery-btn" data-completed-at="' + id + '" hidden>View all</button>' +
            '</div>' +
          '</div>' +
        '</td>';
      tbody.appendChild(tr);

      const detailsTr = document.createElement('tr');
      detailsTr.className = 'log-details';
      detailsTr.hidden = !isExpanded;
      detailsTr.dataset.id = id;
      const detailsCell = document.createElement('td');
      detailsCell.colSpan = 4;
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
    const galBtn = e.target.closest('.log-gallery-btn');
    if (galBtn) {
      e.preventDefault();
      e.stopPropagation();
      openGallery(Number(galBtn.dataset.completedAt));
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
      const id = Number(row.dataset.id);
      const wasExpanded = expandedIds.has(id) || editingId === id;
      if (wasExpanded) {
        expandedIds.delete(id);
        if (editingId === id) {
          editingId = null;
          editingMediaItems = null;
          editMediaPromise = null;
        }
      } else {
        expandedIds.add(id);
      }
      render();
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const detailsTr = actionBtn.closest('tr.log-details');
    if (!detailsTr) return;
    const id = Number(detailsTr.dataset.id);
    const action = actionBtn.dataset.action;

    if (action === 'edit') {
      editingId = id;
      expandedIds.add(id);
      editingMediaItems = [];
      if (window.EtmMediaDB) {
        editMediaPromise = window.EtmMediaDB.loadLogPhotos(storageKey, id).then((photos) => {
          editingMediaItems = photos.map((p) => Object.assign({}, p));
          const form = tbody.querySelector('.edit-form[data-id="' + id + '"]');
          if (form) renderEditMediaThumbs(form);
          return editingMediaItems;
        });
      } else {
        editMediaPromise = Promise.resolve();
      }
      render();
    } else if (action === 'delete') {
      deleteEntry(id);
    } else if (action === 'cancel') {
      editingId = null;
      editingMediaItems = null;
      editMediaPromise = null;
      render();
    } else if (action === 'save') {
      const form = actionBtn.closest('.edit-form');
      if (form) saveEdit(id, form);
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
    const entries = readLog();
    const dbName = 'etm-checklist-photo-db';
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'ETM Checklist cleaning log export',
      locationStorageKey: storageKey,
      localStorageLogKey: logKey,
      indexedDbName: dbName,
      note:
        'This JSON is metadata from localStorage only. Photos and videos are stored separately in this browser\'s IndexedDB (' +
        dbName +
        '). Draft uploads use key "' +
        storageKey +
        '". Saved log attachments use keys "' +
        storageKey +
        '::log::<completedAt>" for each entry. Opening this file elsewhere or on another device will not include those files.',
      entryCount: entries.length,
      entries: entries
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeSlug = String(storageKey).replace(/[^a-z0-9-]+/gi, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cleaning-log-' + safeSlug + '-' + Date.now() + '.json';
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
      title: 'Clear Entire Log?',
      message: "This will permanently remove every cleaning entry. This cannot be undone.",
      confirmLabel: 'Yes \u2014 Clear All',
      cancelLabel: 'No \u2014 Keep Log',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      if (window.EtmMediaDB) {
        window.EtmMediaDB.clearAllMediaForStorageKey(storageKey).catch(() => {});
      }
      localStorage.removeItem(logKey);
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
