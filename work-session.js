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
            '<div class="summary-tile"><span class="summary-num">' + String(totalMilesThisYear) + '</span><span class="summary-label">Total Miles This Year</span></div>' +
            '<div class="summary-tile"><span class="summary-num">' + String(totalMilesThisMonth) + '</span><span class="summary-label">Total Miles This Month</span></div>' +
            '<div class="summary-tile"><span class="summary-num">' + formatElapsed(totalMs) + '</span><span class="summary-label">Total Time Worked</span></div>' +
            '<div class="summary-tile"><span class="summary-num">' + formatElapsed(totalTimeThisWeekMs) + '</span><span class="summary-label">Total Time Worked This Week</span></div>';
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
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td data-label="Date">' + formatDate(entry.endedAt) + '</td>' +
          '<td data-label="Started - Ended">' + formatTime(entry.startedAt) + ' - ' + formatTime(entry.endedAt) + '</td>' +
          '<td data-label="Duration"><span class="duration-pill">' + formatElapsed(entry.elapsedMs) + '</span></td>' +
          '<td data-label="Start Mileage">' + String(entry.startMileage) + '</td>' +
          '<td data-label="End Mileage">' + String(entry.endMileage) + '</td>' +
          '<td data-label="Miles">' + String(entry.milesDriven) + '</td>';
        tbody.appendChild(tr);
      });
    }

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
