(function () {
  var ACTIVE_KEY = 'etm-work-session:active';
  var LOG_KEY = 'etm-work-session:log';

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatElapsed(ms) {
    var totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function toDatetimeLocal(ts) {
    var d = new Date(Number(ts) || 0);
    if (isNaN(d.getTime())) return '';
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatWorkLogNotes(text) {
    var t = text == null ? '' : String(text).trim();
    if (!t) return '';
    return escapeHtml(t).replace(/\r\n|\r|\n/g, '<br />');
  }

  function workLogRowKey(entry) {
    if (entry && entry.id != null && entry.id !== undefined) return Number(entry.id);
    return Number(entry.endedAt);
  }

  function findWorkLogEntryIndex(log, entryId) {
    var n = Number(entryId);
    if (isNaN(n)) return -1;
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (e && e.id != null && Number(e.id) === n) return i;
      if (e && (e.id == null || e.id === undefined) && Number(e.endedAt) === n) return i;
    }
    return -1;
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readActive() {
    var active = readJson(ACTIVE_KEY, null);
    if (!active || !active.startedAt || typeof active.startMileage !== 'number') return null;
    return active;
  }

  function readLog() {
    var arr = readJson(LOG_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function writeLog(entries) {
    writeJson(LOG_KEY, entries);
  }

  function notify(message) {
    if (window.EtmModal) return window.EtmModal.alert(message);
    alert(message);
    return Promise.resolve();
  }

  function confirmAction(opts) {
    if (window.EtmModal) return window.EtmModal.confirm(opts);
    return Promise.resolve(window.confirm(typeof opts === 'string' ? opts : opts.message));
  }

  function parseMileageInput(message, defaultValue) {
    var initial = typeof defaultValue === 'number' ? String(defaultValue) : '';
    return showMileageModal(message, initial).then(function (raw) {
      if (raw === null) return null;
      var value = Number(String(raw).trim());
      if (!isFinite(value) || value < 0) return NaN;
      return value;
    });
  }

  var mileageModalEl = null;
  var mileageResolve = null;

  function ensureMileageModal() {
    if (mileageModalEl) return mileageModalEl;
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = 'workMileageModal';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="modal work-mileage-modal" role="dialog" aria-modal="true" aria-labelledby="workMileageTitle">' +
      '<h2 id="workMileageTitle">Mileage</h2>' +
      '<p id="workMileagePrompt"></p>' +
      '<input type="number" min="0" step="0.1" id="workMileageInput" class="work-mileage-input" inputmode="decimal" />' +
      '<div class="modal-actions">' +
      '<button type="button" class="modal-btn modal-no" id="workMileageCancel">Cancel</button>' +
      '<button type="button" class="modal-btn modal-yes" id="workMileageOk">OK</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    mileageModalEl = wrap;

    var cancelBtn = document.getElementById('workMileageCancel');
    var okBtn = document.getElementById('workMileageOk');
    var inputEl = document.getElementById('workMileageInput');

    function close(result) {
      mileageModalEl.classList.remove('is-open');
      mileageModalEl.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (mileageResolve) {
        var r = mileageResolve;
        mileageResolve = null;
        r(result);
      }
    }

    cancelBtn.addEventListener('click', function () {
      close(null);
    });
    okBtn.addEventListener('click', function () {
      close(inputEl.value);
    });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        close(inputEl.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      }
    });
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) close(null);
    });
    return mileageModalEl;
  }

  function showMileageModal(message, initial) {
    ensureMileageModal();
    var promptEl = document.getElementById('workMileagePrompt');
    var inputEl = document.getElementById('workMileageInput');
    promptEl.textContent = message || 'Enter mileage';
    inputEl.value = initial || '';
    mileageModalEl.classList.add('is-open');
    mileageModalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      inputEl.focus();
      inputEl.select();
    }, 0);
    return new Promise(function (resolve) {
      mileageResolve = resolve;
    });
  }

  var workNotesModalEl = null;
  var workNotesResolve = null;

  function ensureWorkSessionNotesModal() {
    if (workNotesModalEl) return workNotesModalEl;
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = 'workSessionNotesModal';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="modal work-session-notes-modal" role="dialog" aria-modal="true" aria-labelledby="workSessionNotesTitle">' +
      '<h2 id="workSessionNotesTitle">Session notes</h2>' +
      '<p class="work-session-notes-hint">Optional — shown only when you open this entry in the work log.</p>' +
      '<textarea id="workSessionNotesInput" class="work-session-notes-input" rows="4" placeholder="Stops, fuel, issues, etc."></textarea>' +
      '<div class="modal-actions">' +
      '<button type="button" class="modal-btn modal-yes" id="workSessionNotesSkip">Skip</button>' +
      '<button type="button" class="modal-btn modal-no" id="workSessionNotesSave">Save session</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    workNotesModalEl = wrap;

    var skipBtn = document.getElementById('workSessionNotesSkip');
    var saveBtn = document.getElementById('workSessionNotesSave');
    var ta = document.getElementById('workSessionNotesInput');

    function close(notesTrimmed) {
      workNotesModalEl.classList.remove('is-open');
      workNotesModalEl.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (workNotesResolve) {
        var r = workNotesResolve;
        workNotesResolve = null;
        r(notesTrimmed);
      }
    }

    skipBtn.addEventListener('click', function () {
      close('');
    });
    saveBtn.addEventListener('click', function () {
      close(String(ta.value || '').trim());
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close('');
      }
    });
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) close('');
    });
    return workNotesModalEl;
  }

  function showWorkSessionNotesModal() {
    ensureWorkSessionNotesModal();
    var ta = document.getElementById('workSessionNotesInput');
    ta.value = '';
    workNotesModalEl.classList.add('is-open');
    workNotesModalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      ta.focus();
    }, 0);
    return new Promise(function (resolve) {
      workNotesResolve = resolve;
    });
  }

  function initHomePanel() {
    var card = document.getElementById('workSessionCard');
    var timerEl = document.getElementById('workSessionTimer');
    var mileageEl = document.getElementById('workSessionMileage');
    var statusEl = document.getElementById('workSessionStatus');
    var toggleBtn = document.getElementById('workSessionToggleBtn');
    if (!card || !timerEl || !mileageEl || !statusEl || !toggleBtn) return;

    var tickHandle = null;

    function clearTick() {
      if (tickHandle) {
        clearInterval(tickHandle);
        tickHandle = null;
      }
    }

    function render() {
      var active = readActive();
      if (!active) {
        card.classList.remove('is-active');
        toggleBtn.textContent = 'Start Work';
        toggleBtn.className = 'btn-primary work-session-toggle-btn';
        toggleBtn.setAttribute('aria-label', 'Start work session');
        toggleBtn.disabled = false;
        timerEl.textContent = '00:00:00';
        mileageEl.textContent = 'Not started';
        statusEl.textContent = 'Enter starting mileage to begin.';
        clearTick();
        return;
      }

      card.classList.add('is-active');
      toggleBtn.textContent = 'End Work';
      toggleBtn.className = 'btn-secondary work-session-toggle-btn';
      toggleBtn.setAttribute('aria-label', 'End work session');
      toggleBtn.disabled = false;
      statusEl.textContent = 'Work in progress… tap End Work to complete this session.';
      mileageEl.textContent = String(active.startMileage);

      function updateTimer() {
        timerEl.textContent = formatElapsed(Date.now() - Number(active.startedAt));
      }

      updateTimer();
      clearTick();
      tickHandle = setInterval(updateTimer, 1000);
    }

    toggleBtn.addEventListener('click', function () {
      var active = readActive();
      if (!active) {
        parseMileageInput('Enter starting vehicle mileage:').then(function (startMileage) {
          if (startMileage === null) return;
          if (isNaN(startMileage)) {
            notify('Please enter a valid mileage number.');
            return;
          }
          writeJson(ACTIVE_KEY, {
            startedAt: Date.now(),
            startMileage: startMileage
          });
          render();
        });
        return;
      }
      parseMileageInput('Enter ending vehicle mileage:', active.startMileage).then(function (endMileage) {
        if (endMileage === null) return;
        if (isNaN(endMileage)) {
          notify('Please enter a valid mileage number.');
          return;
        }
        if (endMileage < Number(active.startMileage)) {
          notify('Ending mileage cannot be lower than starting mileage.');
          return;
        }
        var endedAt = Date.now();
        var startAt = Number(active.startedAt);
        var startMi = Number(active.startMileage);
        showWorkSessionNotesModal().then(function (notesText) {
          var notes = notesText != null ? String(notesText).trim() : '';
          var entry = {
            id: endedAt,
            startedAt: startAt,
            endedAt: endedAt,
            elapsedMs: Math.max(0, endedAt - startAt),
            startMileage: startMi,
            endMileage: endMileage,
            milesDriven: endMileage - startMi
          };
          if (notes) entry.notes = notes;
          var log = readLog();
          log.push(entry);
          writeLog(log);
          localStorage.removeItem(ACTIVE_KEY);
          render();
        });
      });
    });

    window.addEventListener('pageshow', render);
    window.addEventListener('beforeunload', clearTick);
    render();
  }

  function initWorkLogPage() {
    var tbody = document.getElementById('workLogBody');
    var tableWrap = document.getElementById('workLogTableWrap');
    var emptyEl = document.getElementById('workLogEmpty');
    var clearBtn = document.getElementById('clearWorkLogBtn');
    var summaryEl = document.getElementById('workLogSummary');
    if (!tbody || !tableWrap || !emptyEl || !clearBtn) return;

    var editingId = null;
    var expandedIds = new Set();

    function buildWorkLogViewBody(entry) {
      var sm = entry.startMileage != null ? String(entry.startMileage) : '—';
      var em = entry.endMileage != null ? String(entry.endMileage) : '—';
      var md =
        entry.milesDriven != null ? String(entry.milesDriven) : '—';
      return (
        '<div class="entry-actions">' +
        '<button type="button" class="entry-btn edit-btn" data-action="edit">&#9998; Edit</button>' +
        '<button type="button" class="entry-btn delete-btn" data-action="delete">&#10005; Delete</button>' +
        '</div>' +
        '<div class="work-log-detail-body">' +
        '<p class="work-log-detail-line"><strong>Odometer</strong> ' +
        escapeHtml(sm) +
        ' → ' +
        escapeHtml(em) +
        ' <span class="work-log-detail-miles">(' +
        escapeHtml(md) +
        ' mi)</span></p>' +
        '<p class="work-log-detail-line"><strong>Duration</strong> ' +
        escapeHtml(formatElapsed(entry.elapsedMs || 0)) +
        '</p>' +
        (entry.notes && String(entry.notes).trim()
          ? '<div class="log-notes-block work-log-notes-in-detail">' +
            '<h4 class="log-notes-title">Notes</h4>' +
            '<div class="log-notes-body">' +
            formatWorkLogNotes(entry.notes) +
            '</div></div>'
          : '') +
        '</div>'
      );
    }

    function buildWorkLogEditForm(entry, rowKey) {
      var html =
        '<div class="edit-form" data-work-id="' +
        String(rowKey) +
        '">' +
        '<div class="edit-fields">' +
        '<label class="edit-field"><span>Started</span>' +
        '<input type="datetime-local" step="1" data-field="startedAt" value="' +
        escapeHtml(toDatetimeLocal(entry.startedAt)) +
        '" /></label>' +
        '<label class="edit-field"><span>Ended</span>' +
        '<input type="datetime-local" step="1" data-field="endedAt" value="' +
        escapeHtml(toDatetimeLocal(entry.endedAt)) +
        '" /></label>' +
        '</div>' +
        '<div class="edit-fields">' +
        '<label class="edit-field"><span>Start mileage</span>' +
        '<input type="number" min="0" step="0.1" inputmode="decimal" data-field="startMileage" value="' +
        escapeHtml(String(entry.startMileage != null ? entry.startMileage : '')) +
        '" /></label>' +
        '<label class="edit-field"><span>End mileage</span>' +
        '<input type="number" min="0" step="0.1" inputmode="decimal" data-field="endMileage" value="' +
        escapeHtml(String(entry.endMileage != null ? entry.endMileage : '')) +
        '" /></label>' +
        '</div>' +
        '<label class="edit-field edit-field-work-notes"><span>Notes (optional)</span>' +
        '<textarea data-field="notes" class="work-log-edit-notes" rows="4" placeholder="">' +
        escapeHtml(entry.notes != null ? String(entry.notes) : '') +
        '</textarea></label>' +
        '<div class="edit-actions">' +
        '<button type="button" class="btn-secondary" data-action="cancel">Cancel</button>' +
        '<button type="button" class="btn-primary" data-action="save">Save Changes</button>' +
        '</div>' +
        '</div>';
      return html;
    }

    function deleteWorkEntry(rowKey) {
      confirmAction({
        title: 'Delete This Work Session?',
        message: 'This will permanently remove this session from the log. This cannot be undone.',
        confirmLabel: 'Yes — Delete',
        cancelLabel: 'Cancel'
      }).then(function (ok) {
        if (!ok) return;
        var log = readLog().filter(function (e) {
          return workLogRowKey(e) !== Number(rowKey);
        });
        writeLog(log);
        expandedIds.delete(Number(rowKey));
        if (editingId === Number(rowKey)) editingId = null;
        renderLog();
      });
    }

    function saveWorkLogEdit(rowKey, formEl) {
      var log = readLog();
      var idx = findWorkLogEntryIndex(log, rowKey);
      if (idx < 0) return;
      var entry = log[idx];

      var startInput = formEl.querySelector('[data-field="startedAt"]');
      var endInput = formEl.querySelector('[data-field="endedAt"]');
      var startMiInput = formEl.querySelector('[data-field="startMileage"]');
      var endMiInput = formEl.querySelector('[data-field="endMileage"]');
      var notesInput = formEl.querySelector('[data-field="notes"]');

      var newStart = new Date(startInput.value).getTime();
      var newEnd = new Date(endInput.value).getTime();
      if (isNaN(newStart) || isNaN(newEnd)) {
        notify('Please enter valid start and end date/times.');
        return;
      }
      if (newEnd < newStart) {
        notify('End time cannot be before start time.');
        return;
      }

      var startMi = parseFloat(String(startMiInput.value).trim());
      var endMi = parseFloat(String(endMiInput.value).trim());
      if (!isFinite(startMi) || !isFinite(endMi)) {
        notify('Please enter valid start and end mileage.');
        return;
      }
      if (endMi < startMi) {
        notify('End mileage cannot be less than start mileage.');
        return;
      }

      entry.startedAt = newStart;
      entry.endedAt = newEnd;
      entry.elapsedMs = Math.max(0, newEnd - newStart);
      entry.startMileage = startMi;
      entry.endMileage = endMi;
      entry.milesDriven = Math.round((endMi - startMi) * 100) / 100;
      if (entry.id == null || entry.id === undefined) {
        entry.id = Number(rowKey);
      }
      var noteVal = notesInput ? String(notesInput.value).trim() : '';
      if (noteVal) {
        entry.notes = noteVal;
      } else {
        delete entry.notes;
      }

      editingId = null;
      writeLog(log);
      renderLog();
    }

    function renderLog() {
      var entries = readLog().slice().sort(function (a, b) {
        return Number(b.endedAt || 0) - Number(a.endedAt || 0);
      });
      tbody.innerHTML = '';
      if (summaryEl) {
        if (!entries.length) {
          summaryEl.innerHTML = '';
        } else {
          var now = new Date();
          var year = now.getFullYear();
          var month = now.getMonth();
          var totalMilesThisMonth = entries.reduce(function (sum, entry) {
            var endedAt = Number(entry.endedAt) || 0;
            var d = new Date(endedAt);
            if (d.getFullYear() !== year || d.getMonth() !== month) return sum;
            return sum + (Number(entry.milesDriven) || 0);
          }, 0);
          /* Calendar week Mon–Sun (local): Mon 00:00:00 through Sun 23:59:59.999 */
          var startOfWeek = new Date(now);
          var dayOfWeek = startOfWeek.getDay();
          var daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          startOfWeek.setDate(startOfWeek.getDate() - daysFromMonday);
          startOfWeek.setHours(0, 0, 0, 0);
          var endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          var startOfWeekMs = startOfWeek.getTime();
          var endOfWeekMs = endOfWeek.getTime();
          var totalMilesThisWeek = entries.reduce(function (sum, entry) {
            var endedAt = Number(entry.endedAt) || 0;
            if (endedAt < startOfWeekMs || endedAt > endOfWeekMs) return sum;
            return sum + (Number(entry.milesDriven) || 0);
          }, 0);
          var totalTimeThisMonthMs = entries.reduce(function (sum, entry) {
            var endedAt = Number(entry.endedAt) || 0;
            var d = new Date(endedAt);
            if (d.getFullYear() !== year || d.getMonth() !== month) return sum;
            return sum + (Number(entry.elapsedMs) || 0);
          }, 0);
          var totalTimeThisWeekMs = entries.reduce(function (sum, entry) {
            var endedAt = Number(entry.endedAt) || 0;
            if (endedAt < startOfWeekMs || endedAt > endOfWeekMs) return sum;
            return sum + (Number(entry.elapsedMs) || 0);
          }, 0);
          summaryEl.innerHTML =
            '<div class="summary-tile summary-tile-work summary-tile-work-miles-month"><span class="summary-num">' + String(totalMilesThisMonth) + '</span><span class="summary-label">Total Miles This Month</span></div>' +
            '<div class="summary-tile summary-tile-work summary-tile-work-miles-week"><span class="summary-num">' + String(totalMilesThisWeek) + '</span><span class="summary-label">Total Miles This Week</span></div>' +
            '<div class="summary-tile summary-tile-work summary-tile-work-time-month"><span class="summary-num">' + formatElapsed(totalTimeThisMonthMs) + '</span><span class="summary-label">Total Time Worked This Month</span></div>' +
            '<div class="summary-tile summary-tile-work summary-tile-work-time-week"><span class="summary-num">' + formatElapsed(totalTimeThisWeekMs) + '</span><span class="summary-label">Total Time Worked This Week</span></div>';
        }
      }
      if (!entries.length) {
        tableWrap.hidden = true;
        emptyEl.hidden = false;
        return;
      }
      tableWrap.hidden = false;
      emptyEl.hidden = true;
      entries.forEach(function (entry) {
        var rowKey = workLogRowKey(entry);
        var id = Number(rowKey);
        var isExpanded = expandedIds.has(id) || editingId === id;
        var isEditing = editingId === id;

        var tr = document.createElement('tr');
        tr.className =
          'log-row work-log-row' + (isExpanded ? ' expanded' : '');
        tr.dataset.id = String(rowKey);
        tr.innerHTML =
          '<td class="work-log-col-date" data-label="Date">' +
          formatDate(entry.endedAt) +
          '</td>' +
          '<td class="work-log-col-started" data-label="Started">' +
          formatTime(entry.startedAt) +
          '</td>' +
          '<td class="work-log-col-ended" data-label="Ended">' +
          formatTime(entry.endedAt) +
          '</td>' +
          '<td data-label="Duration" class="td-duration-stack">' +
          '<div class="duration-stack">' +
          '<span class="duration-cell">' +
          '<span class="duration-pill">' +
          formatElapsed(entry.elapsedMs) +
          '</span>' +
          '<span class="expand-arrow" aria-hidden="true">&#9656;</span>' +
          '</span>' +
          '</div>' +
          '</td>' +
          '<td class="work-log-col-odo-start" data-label="Start mi">' +
          String(entry.startMileage) +
          '</td>' +
          '<td class="work-log-col-odo-end" data-label="End mi">' +
          String(entry.endMileage) +
          '</td>' +
          '<td class="work-log-col-miles-delta" data-label="Miles">' +
          String(entry.milesDriven) +
          '</td>';
        tbody.appendChild(tr);

        var detailsTr = document.createElement('tr');
        detailsTr.className = 'log-details';
        detailsTr.hidden = !isExpanded;
        detailsTr.dataset.id = String(rowKey);
        var detailsCell = document.createElement('td');
        detailsCell.colSpan = 7;
        detailsCell.innerHTML = isEditing
          ? buildWorkLogEditForm(entry, rowKey)
          : buildWorkLogViewBody(entry);
        detailsTr.appendChild(detailsCell);
        tbody.appendChild(detailsTr);
      });
    }

    tbody.addEventListener('click', function (e) {
      var row = e.target.closest('tr.log-row');
      if (row) {
        var id = Number(row.dataset.id);
        var wasExpanded = expandedIds.has(id) || editingId === id;
        if (wasExpanded) {
          expandedIds.delete(id);
          if (editingId === id) editingId = null;
        } else {
          expandedIds.add(id);
        }
        renderLog();
        return;
      }

      var actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      var detailsTr = actionBtn.closest('tr.log-details');
      if (!detailsTr) return;
      var id = Number(detailsTr.dataset.id);
      var action = actionBtn.dataset.action;

      if (action === 'edit') {
        editingId = id;
        expandedIds.add(id);
        renderLog();
      } else if (action === 'delete') {
        deleteWorkEntry(id);
      } else if (action === 'cancel') {
        editingId = null;
        renderLog();
      } else if (action === 'save') {
        var form = actionBtn.closest('.edit-form');
        if (form) saveWorkLogEdit(id, form);
      }
    });

    clearBtn.addEventListener('click', function () {
      confirmAction({
        title: 'Clear Work Session Log?',
        message: 'This will permanently remove every work session entry. This cannot be undone.',
        confirmLabel: 'Yes — Clear Log',
        cancelLabel: 'Cancel'
      }).then(function (ok) {
        if (!ok) return;
        localStorage.removeItem(LOG_KEY);
        renderLog();
      });
    });

    renderLog();
  }

  initHomePanel();
  initWorkLogPage();
})();
