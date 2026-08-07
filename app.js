(function (global) {
  /**
   * iOS Safari only fires `click` on the first tap of an element styled with
   * `:hover` if something is listening for touch — otherwise the first tap
   * just previews the `:hover` state and the second tap is needed to click.
   * An empty, passive touchstart listener is the standard workaround.
   */
  if (global.document) {
    global.document.addEventListener('touchstart', function () {}, { passive: true });
  }

  /** iOS WebKit PWA sometimes tints the overscroll “gutter”; force white on paint. */
  function paintOverscrollWhite() {
    var doc = global.document;
    if (!doc) return;
    var h = doc.documentElement;
    var b = doc.body;
    if (h) {
      h.style.backgroundColor = '#ffffff';
      h.style.setProperty('color-scheme', 'only light');
    }
    if (b) {
      b.style.backgroundColor = '#ffffff';
    }
  }
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', paintOverscrollWhite, {
        once: true
      });
    } else {
      paintOverscrollWhite();
    }
    global.addEventListener('pageshow', paintOverscrollWhite);
  }

  var CACHE_PREFIX = 'etm-checklist-';

  function deleteAppCaches() {
    if (!('caches' in global)) {
      return Promise.resolve();
    }
    return global.caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) {
            return k.indexOf(CACHE_PREFIX) === 0;
          })
          .map(function (k) {
            return global.caches.delete(k);
          })
      );
    });
  }

  /**
   * Custom confirm/alert dialogs styled to match the app (reuses the same
   * .modal-backdrop/.modal CSS as the page-authored modals) instead of the
   * OS's native confirm()/alert() chrome. Built once, lazily, and reused.
   */
  var modalDom = null;
  var modalResolver = null;

  function ensureModalDom() {
    if (modalDom) return modalDom;
    var doc = global.document;
    var backdrop = doc.createElement('div');
    backdrop.className = 'modal-backdrop etm-modal-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    var modal = doc.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');

    var h2 = doc.createElement('h2');
    h2.id = 'etmModalTitle';
    modal.setAttribute('aria-labelledby', 'etmModalTitle');
    var p = doc.createElement('p');
    p.id = 'etmModalMessage';
    p.style.whiteSpace = 'pre-line';
    modal.setAttribute('aria-describedby', 'etmModalMessage');

    var actions = doc.createElement('div');
    actions.className = 'modal-actions';

    var cancelBtn = doc.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-no';

    var okBtn = doc.createElement('button');
    okBtn.type = 'button';

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    modal.appendChild(h2);
    modal.appendChild(p);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    doc.body.appendChild(backdrop);

    function close(result) {
      backdrop.classList.remove('is-open');
      doc.body.style.overflow = '';
      var resolve = modalResolver;
      modalResolver = null;
      if (resolve) resolve(result);
    }

    cancelBtn.addEventListener('click', function (e) {
      e.preventDefault();
      close(false);
    });
    okBtn.addEventListener('click', function (e) {
      e.preventDefault();
      close(true);
    });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.classList.contains('is-open')) close(false);
    });

    modalDom = {
      backdrop: backdrop,
      h2: h2,
      p: p,
      actions: actions,
      cancelBtn: cancelBtn,
      okBtn: okBtn,
      close: close
    };
    return modalDom;
  }

  function openModal(opts, single) {
    var els = ensureModalDom();
    els.h2.textContent = opts.title || (single ? 'Notice' : 'Please confirm');
    els.p.textContent = opts.message || '';
    els.actions.className = single ? 'modal-actions modal-actions-single' : 'modal-actions';
    els.cancelBtn.hidden = !!single;
    if (!single) {
      els.cancelBtn.textContent = opts.cancelLabel || 'Cancel';
    }
    els.okBtn.textContent = single ? (opts.okLabel || 'OK') : (opts.confirmLabel || 'Confirm');
    els.okBtn.className = 'modal-btn ' + (
      single ? 'modal-primary-solid' : (opts.danger === false ? 'modal-yes' : 'modal-danger')
    );
    els.backdrop.classList.add('is-open');
    global.document.body.style.overflow = 'hidden';
    global.setTimeout(function () {
      (single ? els.okBtn : els.cancelBtn).focus();
    }, 0);
    return new Promise(function (resolve) {
      modalResolver = resolve;
    });
  }

  global.EtmModal = {
    /** Resolves true/false — replacement for window.confirm(). */
    confirm: function (opts) {
      return openModal(typeof opts === 'string' ? { message: opts } : opts, false);
    },
    /** Resolves once dismissed — replacement for window.alert(). */
    alert: function (opts) {
      return openModal(typeof opts === 'string' ? { message: opts } : opts, true).then(function () {});
    }
  };

  /**
   * Clears this app’s offline file cache, checks for a new service worker, then reloads.
   * Does not clear localStorage or IndexedDB (checklists and photos stay).
   */
  global.EtmAppRefresh = {
    reloadLatest: function () {
      return deleteAppCaches()
        .then(function () {
          if (!('serviceWorker' in global.navigator)) {
            return;
          }
          return global.navigator.serviceWorker
            .getRegistration()
            .then(function (reg) {
              if (reg) {
                return reg.update();
              }
            });
        })
        .then(function () {
          global.location.reload();
        })
        .catch(function () {
          global.location.reload();
        });
    }
  };
})(typeof window !== 'undefined' ? window : this);

if ('serviceWorker' in navigator) {
  let reloadOnceForNewWorker = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnceForNewWorker) return;
    reloadOnceForNewWorker = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('nosw') === '1') {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
        return;
      }

      const hostname = window.location.hostname;
      const isLocalDev =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]';
      const forceSw = params.get('sw') === '1';
      if (isLocalDev && !forceSw) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
        return;
      }
    } catch (e) {
      /* ignore */
    }

    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        reg.update();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update();
          }
        });
      })
      .catch(() => {
        /* offline support unavailable in this context */
      });
  });
}
