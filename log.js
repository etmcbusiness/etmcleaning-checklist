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

  function formatElapsed(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return pad(h) + ':' + pad(m) + ':' + pad(s);
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

  function render() {
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
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td data-label="Date">' + formatDate(entry.completedAt) + '</td>' +
        '<td data-label="Started">' + formatTime(entry.sessionStart) + '</td>' +
        '<td data-label="Ended">' + formatTime(entry.completedAt) + '</td>' +
        '<td data-label="Duration"><span class="duration-pill">' + formatElapsed(entry.elapsedMs) + '</span></td>';
      tbody.appendChild(tr);
    });
  }

  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the entire cleaning log? This cannot be undone.')) return;
    localStorage.removeItem(logKey);
    render();
  });

  render();
})();
