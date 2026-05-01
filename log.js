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
    if (!ms || ms < 0) ms = 0;
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

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildTaskBreakdown(tasks) {
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
      const duration = cumulative - prevMs;
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
      tr.className = 'log-row';
      tr.innerHTML =
        '<td data-label="Date">' + formatDate(entry.completedAt) + '</td>' +
        '<td data-label="Started">' + formatTime(entry.sessionStart) + '</td>' +
        '<td data-label="Ended">' + formatTime(entry.completedAt) + '</td>' +
        '<td data-label="Duration">' +
          '<span class="duration-cell">' +
            '<span class="duration-pill">' + formatElapsed(entry.elapsedMs) + '</span>' +
            '<span class="expand-arrow" aria-hidden="true">&#9656;</span>' +
          '</span>' +
        '</td>';
      tbody.appendChild(tr);

      const detailsTr = document.createElement('tr');
      detailsTr.className = 'log-details';
      detailsTr.hidden = true;
      const detailsCell = document.createElement('td');
      detailsCell.colSpan = 4;
      detailsCell.innerHTML = buildTaskBreakdown(entry.tasks);
      detailsTr.appendChild(detailsCell);
      tbody.appendChild(detailsTr);

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        const isOpen = !detailsTr.hidden;
        detailsTr.hidden = isOpen;
        tr.classList.toggle('expanded', !isOpen);
      });
    });
  }

  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the entire cleaning log? This cannot be undone.')) return;
    localStorage.removeItem(logKey);
    render();
  });

  render();
})();
