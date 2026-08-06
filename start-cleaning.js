(function () {
  var btn = document.getElementById('startCleaningBtn');
  if (!btn) return;
  var notice = document.getElementById('blockNotice');
  var key = btn.dataset.storageKey;

  function isSessionActive() {
    var startedAt = localStorage.getItem(key + ':startedAt');
    var accumulated = localStorage.getItem(key + ':accumulatedMs');
    var completed = localStorage.getItem(key + ':completedAt');
    return (startedAt || accumulated) && !completed;
  }

  function findActiveOtherLocation() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      var m = k.match(/^(checklist-[^:]+):(startedAt|accumulatedMs)$/);
      if (m && m[1] !== key) {
        var completed = localStorage.getItem(m[1] + ':completedAt');
        if (!completed) return m[1];
      }
    }
    return null;
  }

  function syncBtnState() {
    btn.classList.remove('in-progress', 'blocked');
    notice.hidden = true;
    if (isSessionActive()) {
      btn.classList.add('in-progress');
      btn.textContent = 'Continue Cleaning';
    } else if (findActiveOtherLocation()) {
      btn.classList.add('blocked');
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'Cleaning In Progress Elsewhere';
      notice.hidden = false;
    } else {
      btn.removeAttribute('aria-disabled');
      btn.textContent = 'Start Cleaning';
    }
  }

  // ---------- Cleaner-count picker ----------
  var backdrop = null;

  function buildModal() {
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'cleanerCountBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    var modal = document.createElement('div');
    modal.className = 'modal cleaner-count-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cleanerCountTitle');

    var title = document.createElement('h2');
    title.id = 'cleanerCountTitle';
    title.textContent = 'How many cleaners?';

    var hint = document.createElement('p');
    hint.textContent = 'Times and averages are tracked separately for each crew size.';

    var grid = document.createElement('div');
    grid.className = 'cleaner-count-grid';
    [1, 2, 3, 4, 5].forEach(function (n) {
      var optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.className = 'cleaner-count-option';
      optBtn.textContent = String(n);
      optBtn.setAttribute('aria-label', n === 1 ? '1 cleaner' : n + ' cleaners');
      optBtn.addEventListener('click', function () {
        chooseCleanerCount(n);
      });
      grid.appendChild(optBtn);
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-no cleaner-count-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);

    modal.appendChild(title);
    modal.appendChild(hint);
    modal.appendChild(grid);
    modal.appendChild(cancelBtn);
    backdrop.appendChild(modal);

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.classList.contains('is-open')) closeModal();
    });

    document.body.appendChild(backdrop);
    return backdrop;
  }

  function openModal() {
    buildModal().classList.add('is-open');
  }

  function closeModal() {
    if (backdrop) backdrop.classList.remove('is-open');
  }

  function chooseCleanerCount(n) {
    localStorage.setItem(key + ':cleanerCount', String(n));
    var startedKey = key + ':startedAt';
    if (!localStorage.getItem(startedKey)) {
      localStorage.setItem(startedKey, Date.now().toString());
    }
    window.location.href = btn.getAttribute('href');
  }

  btn.addEventListener('click', function (e) {
    if (btn.classList.contains('blocked')) {
      e.preventDefault();
      notice.classList.remove('shake');
      void notice.offsetWidth;
      notice.classList.add('shake');
      return;
    }
    if (isSessionActive()) {
      // Continuing an existing session — crew size was already chosen at start.
      return;
    }
    e.preventDefault();
    openModal();
  });

  syncBtnState();
})();
