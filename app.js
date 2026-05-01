if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      const nosw = new URLSearchParams(window.location.search).get('nosw');
      if (nosw === '1') {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
        return;
      }
    } catch (e) { /* ignore */ }
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support unavailable in this context */
    });
  });
}
