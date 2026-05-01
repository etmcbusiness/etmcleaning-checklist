/**
 * Location page: reveal alarm code after 4-digit PIN (default 1111).
 * No confirm button — fourth digit triggers check. Wrong PIN highlights input red.
 * Not persisted: leaving and returning requires entering the PIN again (incl. bfcache restore).
 */
(function () {
  var PASSCODE = '1111';
  var card = document.querySelector('.alarm-code-card[data-alarm-code]');
  var backdrop = document.getElementById('alarmPinBackdrop');
  if (!card || !backdrop) return;

  var code = String(card.getAttribute('data-alarm-code') || '').trim();
  if (!code) return;

  var revealBtn = card.querySelector('.btn-alarm-reveal');
  var valueEl = card.querySelector('.alarm-code-value');
  var input = document.getElementById('alarmPinInput');
  if (!revealBtn || !valueEl || !input) return;

  function resetGatedState() {
    valueEl.textContent = '';
    valueEl.hidden = true;
    revealBtn.hidden = false;
    closeModal();
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    input.value = '';
  }

  function openModal() {
    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');
    input.value = '';
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    input.focus();
  }

  function closeModal() {
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
  }

  function showCode() {
    valueEl.textContent = code;
    valueEl.hidden = false;
    revealBtn.hidden = true;
  }

  // Always lock when the page is shown again (covers BFCache / iOS PWA where
  // persisted is missing or pagehide did not run before freeze).
  window.addEventListener('pageshow', function () {
    resetGatedState();
  });

  // Snapshot taken for BFCache should not keep the code visible.
  window.addEventListener('pagehide', function () {
    resetGatedState();
  });

  document.addEventListener('freeze', function () {
    resetGatedState();
  });

  revealBtn.addEventListener('click', openModal);

  backdrop.addEventListener('click', function (e) {
    if (e.target === backdrop) closeModal();
  });

  input.addEventListener('input', function () {
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    var raw = String(input.value || '').replace(/\D/g, '').slice(0, 4);
    input.value = raw;
    if (raw.length < 4) return;
    if (raw === PASSCODE) {
      closeModal();
      showCode();
      return;
    }
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    input.value = '';
    input.focus();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && backdrop.classList.contains('is-open')) {
      closeModal();
    }
  });
})();
