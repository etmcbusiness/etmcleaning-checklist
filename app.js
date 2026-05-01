(function (global) {
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
      const nosw = new URLSearchParams(window.location.search).get('nosw');
      if (nosw === '1') {
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
