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

  function toDateInputValue(ts) {
    var d = new Date(Number(ts) || 0);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function applyDateKeepingLocalTime(prevEndMs, yyyymmdd) {
    var old = new Date(Number(prevEndMs) || 0);
    if (isNaN(old.getTime())) return Number(prevEndMs) || 0;
    var parts = String(yyyymmdd || '').split('-');
    if (parts.length !== 3) return old.getTime();
    var y = parseInt(parts[0], 10);
    var mo = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(mo) || isNaN(day)) return old.getTime();
    var next = new Date(old.getTime());
    next.setFullYear(y, mo, day);
    return next.getTime();
  }

  function parseDurationStr(str) {
    if (str == null) return NaN;
    var t = String(str).trim();
    if (!t) return NaN;
    var parts = t.split(':');
    if (parts.length === 1) {
      var n = parseInt(parts[0], 10);
      return isNaN(n) ? NaN : Math.max(0, n) * 1000;
    }
    if (parts.length === 2) {
      var m = Math.max(0, parseInt(parts[0], 10) || 0);
      var s = Math.max(0, parseInt(parts[1], 10) || 0);
      return (m * 60 + s) * 1000;
    }
    if (parts.length === 3) {
      var h = Math.max(0, parseInt(parts[0], 10) || 0);
      var m2 = Math.max(0, parseInt(parts[1], 10) || 0);
      var s2 = Math.max(0, parseInt(parts[2], 10) || 0);
      return (h * 3600 + m2 * 60 + s2) * 1000;
    }
    return NaN;
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

  function initHomePanel() {
    var card = document.getElementById('workSessionCard');
    var timerEl = document.getElementById('workSessionTimer');
    var mileageEl = document.getElementById('workSessionMileage');
    var statusEl = document.getElementById('workSessionStatus');
    var startBtn = document.getElementById('startWorkBtn');
    var endBtn = document.getElementById('endWorkBtn');
    if (!card || !timerEl || !mileageEl || !statusEl || !startBtn || !endBtn) return;

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
        startBtn.disabled = false;
        endBtn.disabled = true;
        timerEl.textContent = '00:00:00';
        mileageEl.textContent = 'Not started';
        statusEl.textContent = 'Enter starting mileage to begin.';
        clearTick();
        return;
      }

      card.classList.add('is-active');
      startBtn.disabled = true;
      endBtn.disabled = false;
      statusEl.textContent = 'Work in progress... End Work to complete this session.';
      mileageEl.textContent = String(active.startMileage);

      function updateTimer() {
        timerEl.textContent = formatElapsed(Date.now() - Number(active.startedAt));
      }

      updateTimer();
      clearTick();
      tickHandle = setInterval(updateTimer, 1000);
    }

    startBtn.addEventListener('click', function () {
      if (readActive()) {
        render();
        return;
      }
      parseMileageInput('Enter starting vehicle mileage:').then(function (startMileage) {
        if (startMileage === null) return;
        if (isNaN(startMileage)) {
          alert('Please enter a valid mileage number.');
          return;
        }
        writeJson(ACTIVE_KEY, {
          startedAt: Date.now(),
          startMileage: startMileage
        });
        render();
      });
    });

    endBtn.addEventListener('click', function () {
      var active = readActive();
      if (!active) {
        render();
        return;
      }
      parseMileageInput('Enter ending vehicle mileage:', active.startMileage).then(function (endMileage) {
        if (endMileage === null) return;
        if (isNaN(endMileage)) {
          alert('Please enter a valid mileage number.');
          return;
        }
        if (endMileage < Number(active.startMileage)) {
          alert('Ending mileage cannot be lower than starting mileage.');
          return;
        }
        var endedAt = Date.now();
        var entry = {
          id: endedAt,
          startedAt: Number(active.startedAt),
          endedAt: endedAt,
          elapsedMs: Math.max(0, endedAt - Number(active.startedAt)),
          startMileage: Number(active.startMileage),
          endMileage: endMileage,
          milesDriven: endMileage - Number(active.startMileage)
        };
        var log = readLog();
        log.push(entry);
        writeLog(log);
        localStorage.removeItem(ACTIVE_KEY);
        render();
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

    var editModalEl = null;
    var workLogEditEntryId = null;

    function ensureEditModal() {
      if (editModalEl) return;
      editModalEl = document.createElement('div');
      editModalEl.className = 'modal-backdrop';
      editModalEl.setAttribute('aria-hidden', 'true');
      editModalEl.innerHTML =
        '<div class="modal work-log-edit-modal" role="dialog" aria-modal="true" aria-labelledby="workLogEditTitle">' +
        '<h2 id="workLogEditTitle">Edit work session</h2>' +
        '<div class="work-log-edit-fields">' +
        '<div class="work-log-edit-field"><label for="workLogEditDate">Session date</label>' +
        '<input type="date" id="workLogEditDate" /></div>' +
        '<div class="work-log-edit-field"><label for="workLogEditDuration">Duration</label>' +
        '<input type="text" id="workLogEditDuration" inputmode="text" autocomplete="off" placeholder="H:MM:SS" />' +
        '<p class="work-log-edit-hint">Clock time of day stays the same; start time is derived from end time minus duration. Use H:MM:SS or M:SS.</p></div>' +
        '<div class="work-log-edit-field"><label for="workLogEditStartMileage">Start mileage</label>' +
        '<input type="number" id="workLogEditStartMileage" min="0" step="0.1" inputmode="decimal" /></div>' +
        '<div class="work-log-edit-field"><label for="workLogEditEndMileage">End mileage</label>' +
        '<input type="number" id="workLogEditEndMileage" min="0" step="0.1" inputmode="decimal" /></div>' +
        '<p class="work-log-edit-mile-preview" id="workLogEditMilesPreview"></p>' +
        '</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="modal-btn modal-yes" id="workLogEditCancel">Cancel</button>' +
        '<button type="button" class="modal-btn modal-no" id="workLogEditSave">Save</button>' +
        '</div></div>';

      document.body.appendChild(editModalEl);

      var dateInp = editModalEl.querySelector('#workLogEditDate');
      var durInp = editModalEl.querySelector('#workLogEditDuration');
      var startInp = editModalEl.querySelector('#workLogEditStartMileage');
      var endInp = editModalEl.querySelector('#workLogEditEndMileage');
      var milesPrev = editModalEl.querySelector('#workLogEditMilesPreview');
      var cancelBtn = editModalEl.querySelector('#workLogEditCancel');
      var saveBtn = editModalEl.querySelector('#workLogEditSave');

      function closeEditModal() {
        editModalEl.classList.remove('is-open');
        editModalEl.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        workLogEditEntryId = null;
      }

      function updateMilesPreview() {
        var a = parseFloat(String(startInp.value).trim());
        var b = parseFloat(String(endInp.value).trim());
        if (!isFinite(a) || !isFinite(b)) {
          milesPrev.textContent = '';
          return;
        }
        var diff = Math.round((b - a) * 100) / 100;
        milesPrev.textContent = 'Miles driven: ' + String(diff);
      }

      startInp.addEventListener('input', updateMilesPreview);
      endInp.addEventListener('input', updateMilesPreview);

      cancelBtn.addEventListener('click', closeEditModal);
      editModalEl.addEventListener('click', function (e) {
        if (e.target === editModalEl) closeEditModal();
      });

      saveBtn.addEventListener('click', function () {
        if (workLogEditEntryId == null) return;
        var log = readLog();
        var idx = findWorkLogEntryIndex(log, workLogEditEntryId);
        if (idx < 0) {
          closeEditModal();
          renderLog();
          return;
        }
        var entry = log[idx];
        var dateVal = dateInp.value;
        if (!dateVal) {
          alert('Please choose a session date.');
          return;
        }
        var elapsedMs = parseDurationStr(durInp.value);
        if (!isFinite(elapsedMs) || elapsedMs < 0) {
          alert('Please enter a valid duration (for example 1:30:00 or 45:30).');
          return;
        }
        var startMi = parseFloat(String(startInp.value).trim());
        var endMi = parseFloat(String(endInp.value).trim());
        if (!isFinite(startMi) || !isFinite(endMi)) {
          alert('Please enter valid start and end mileage.');
          return;
        }
        if (endMi < startMi) {
          alert('End mileage cannot be less than start mileage.');
          return;
        }

        var endedAt = applyDateKeepingLocalTime(Number(entry.endedAt), dateVal);
        var startedAt = endedAt - elapsedMs;

        entry.startedAt = startedAt;
        entry.endedAt = endedAt;
        entry.elapsedMs = elapsedMs;
        entry.startMileage = startMi;
        entry.endMileage = endMi;
        entry.milesDriven = Math.round((endMi - startMi) * 100) / 100;
        if (entry.id == null || entry.id === undefined) {
          entry.id = Number(entry.endedAt) || Date.now();
        }

        writeLog(log);
        closeEditModal();
        renderLog();
      });

      document.addEventListener('keydown', function workLogEditEscape(e) {
        if (e.key !== 'Escape') return;
        if (!editModalEl.classList.contains('is-open')) return;
        closeEditModal();
      });
    }

    function openWorkLogEdit(entry) {
      ensureEditModal();
      workLogEditEntryId = entry.id != null ? entry.id : entry.endedAt;
      var dateInp = editModalEl.querySelector('#workLogEditDate');
      var durInp = editModalEl.querySelector('#workLogEditDuration');
      var startInp = editModalEl.querySelector('#workLogEditStartMileage');
      var endInp = editModalEl.querySelector('#workLogEditEndMileage');
      var milesPrev = editModalEl.querySelector('#workLogEditMilesPreview');
      dateInp.value = toDateInputValue(entry.endedAt);
      durInp.value = formatElapsed(entry.elapsedMs || 0);
      startInp.value = String(entry.startMileage != null ? entry.startMileage : '');
      endInp.value = String(entry.endMileage != null ? entry.endMileage : '');
      var a = parseFloat(startInp.value);
      var b = parseFloat(endInp.value);
      if (isFinite(a) && isFinite(b)) {
        milesPrev.textContent =
          'Miles driven: ' + String(Math.round((b - a) * 100) / 100);
      } else {
        milesPrev.textContent = '';
      }
      editModalEl.classList.add('is-open');
      editModalEl.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      setTimeout(function () {
        dateInp.focus();
      }, 0);
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
          var totalMs = entries.reduce(function (sum, entry) {
            return sum + (Number(entry.elapsedMs) || 0);
          }, 0);
          var now = new Date();
          var year = now.getFullYear();
          var month = now.getMonth();
          var totalMilesThisYear = entries.reduce(function (sum, entry) {
            var endedAt = Number(entry.endedAt) || 0;
            var d = new Date(endedAt);
            if (d.getFullYear() !== year) return sum;
            return sum + (Number(entry.milesDriven) || 0);
          }, 0);
          var totalMilesThisMonth = entries.reduce(function (sum, entry) {
            var endedAt = Number(entry.endedAt) || 0;
            var d = new Date(endedAt);
            if (d.getFullYear() !== year || d.getMonth() !== month) return sum;
            return sum + (Number(entry.milesDriven) || 0);
          }, 0);
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
          var totalTimeThisWeekMs = entries.reduce(function (sum, entry) {
            var endedAt = Number(entry.endedAt) || 0;
            if (endedAt < startOfWeekMs || endedAt > endOfWeekMs) return sum;
            return sum + (Number(entry.elapsedMs) || 0);
          }, 0);
          summaryEl.innerHTML =
            '<div class="summary-tile summary-tile-work summary-tile-work-miles-year"><span class="summary-num">' + String(totalMilesThisYear) + '</span><span class="summary-label">Total Miles This Year</span></div>' +
            '<div class="summary-tile summary-tile-work summary-tile-work-miles-month"><span class="summary-num">' + String(totalMilesThisMonth) + '</span><span class="summary-label">Total Miles This Month</span></div>' +
            '<div class="summary-tile summary-tile-work summary-tile-work-time-total"><span class="summary-num">' + formatElapsed(totalMs) + '</span><span class="summary-label">Total Time Worked</span></div>' +
            '<div class="summary-tile summary-tile-work summary-tile-work-time-week"><span class="summary-num">' + formatElapsed(totalTimeThisWeekMs) + '</span><span class="summary-label">Total Time This Week</span></div>';
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
        var rowId = entry.id != null ? entry.id : entry.endedAt;
        var tr = document.createElement('tr');
        tr.className = 'log-row work-log-row';
        tr.innerHTML =
          '<td data-label="Date">' + formatDate(entry.endedAt) + '</td>' +
          '<td data-label="Time">' + formatTime(entry.startedAt) + ' – ' + formatTime(entry.endedAt) + '</td>' +
          '<td data-label="Duration"><span class="duration-pill">' + formatElapsed(entry.elapsedMs) + '</span></td>' +
          '<td class="work-log-col-odo-start" data-label="Start mi">' + String(entry.startMileage) + '</td>' +
          '<td class="work-log-col-odo-end" data-label="End mi">' + String(entry.endMileage) + '</td>' +
          '<td class="work-log-col-miles-delta" data-label="Miles">' + String(entry.milesDriven) + '</td>' +
          '<td class="work-log-actions-cell" data-label=""><button type="button" class="entry-btn work-log-edit-btn" data-entry-id="' +
          String(rowId) +
          '">Edit</button></td>';
        tbody.appendChild(tr);
      });
    }

    tbody.addEventListener('click', function (e) {
      var btn = e.target.closest('.work-log-edit-btn');
      if (!btn) return;
      e.preventDefault();
      var id = btn.getAttribute('data-entry-id');
      var log = readLog();
      var idx = findWorkLogEntryIndex(log, id);
      if (idx < 0) return;
      openWorkLogEdit(log[idx]);
    });

    clearBtn.addEventListener('click', function () {
      if (!window.confirm('Clear all work session log entries? This cannot be undone.')) return;
      localStorage.removeItem(LOG_KEY);
      renderLog();
    });

    renderLog();
  }

  initHomePanel();
  initWorkLogPage();
})();
