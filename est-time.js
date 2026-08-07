/**
 * Location page: replaces the static "Est. Time to Complete" figure with a small
 * scroll wheel (1 cleaner, 2, 3, ...) — picking a count shows the real average
 * elapsed time from this location's own log for cleanings done with that many
 * cleaners (same buckets checklist.js/log.js track). Never fabricates a number:
 * a count with no logged history says so instead of estimating.
 */
(function () {
  var btn = document.getElementById('startCleaningBtn');
  var valueEl = document.getElementById('estTimeValue');
  var wheelRow = document.getElementById('estTimeWheelRow');
  var wheel = document.getElementById('estTimeWheel');
  var track = document.getElementById('estTimeWheelTrack');
  if (!btn || !valueEl || !wheelRow || !wheel || !track) return;
  var storageKey = btn.dataset.storageKey;
  if (!storageKey) return;

  var ITEM_SIZE = 36;

  function formatDuration(ms) {
    var totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return totalMin + ' min';
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (m === 0) return h + (h === 1 ? ' hour' : ' hours');
    return h + (h === 1 ? ' hour ' : ' hours ') + m + ' min';
  }

  function readLog() {
    try {
      var raw = localStorage.getItem(storageKey + ':log');
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  var log = readLog();
  if (!log.length) {
    valueEl.textContent = 'No cleanings logged yet';
    return;
  }

  var byCleaners = {};
  var maxCount = 5;
  log.forEach(function (e) {
    var n = Number(e.cleaners) || 1;
    if (!byCleaners[n]) byCleaners[n] = [];
    byCleaners[n].push(e);
    if (n > maxCount) maxCount = n;
  });

  var counts = [];
  for (var i = 1; i <= maxCount; i++) counts.push(i);

  // Default the wheel to whichever crew size actually has the most history.
  var defaultN = 1;
  var bestLen = 0;
  counts.forEach(function (n) {
    var len = byCleaners[n] ? byCleaners[n].length : 0;
    if (len > bestLen) {
      bestLen = len;
      defaultN = n;
    }
  });

  track.innerHTML = counts
    .map(function (n) {
      return '<div class="est-time-wheel-item" data-count="' + n + '">' + n + '</div>';
    })
    .join('');

  var items = Array.prototype.slice.call(track.querySelectorAll('.est-time-wheel-item'));

  function renderValue(n) {
    var entries = byCleaners[n];
    if (!entries || !entries.length) {
      valueEl.textContent = 'No data for ' + n + (n === 1 ? ' cleaner' : ' cleaners');
      return;
    }
    var avgMs = entries.reduce(function (s, e) { return s + (e.elapsedMs || 0); }, 0) / entries.length;
    var crewLabel = n === 1 ? '1 cleaner' : n + ' cleaners';
    valueEl.textContent = formatDuration(avgMs) + ' avg (' + crewLabel + ')';
  }

  function setActive(idx) {
    items.forEach(function (el, i) {
      el.classList.toggle('is-active', i === idx);
    });
    renderValue(counts[idx]);
  }

  // IntersectionObserver watching a 1px-tall slice at the wheel's vertical center is a
  // more reliable way to know which item is actually centered than computing it from
  // scrollTop — immune to rounding and to firing before scroll-snap finishes settling.
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var idx = items.indexOf(entry.target);
          if (idx >= 0) setActive(idx);
        });
      },
      { root: wheel, rootMargin: '-50% 0px -50% 0px', threshold: 0 }
    );
    items.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    var scrollTimer = null;
    wheel.addEventListener('scroll', function () {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var idx = Math.round(wheel.scrollTop / ITEM_SIZE);
        idx = Math.max(0, Math.min(items.length - 1, idx));
        setActive(idx);
      }, 80);
    });
  }

  wheel.addEventListener('keydown', function (e) {
    var current = items.findIndex(function (el) { return el.classList.contains('is-active'); });
    if (current < 0) current = 0;
    if (e.key === 'ArrowDown' && current < items.length - 1) {
      current++;
      wheel.scrollTo({ top: current * ITEM_SIZE, behavior: 'smooth' });
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && current > 0) {
      current--;
      wheel.scrollTo({ top: current * ITEM_SIZE, behavior: 'smooth' });
      e.preventDefault();
    }
  });

  wheelRow.hidden = false;
  var defaultIdx = counts.indexOf(defaultN);
  wheel.scrollTop = defaultIdx * ITEM_SIZE;
  setActive(defaultIdx);
})();
