/**
 * Shared registry for one-off cleanings — jobs not already set up as a location in the
 * app. Each entry maps a generated storage key (same "checklist-*" convention used by
 * every other location, so the existing single-active-cleaning lock and the master log's
 * dynamic key scan both pick it up for free) to the custom name/address/type entered on
 * one-off-cleaning.html.
 */
(function (global) {
  var REGISTRY_KEY = 'etm-one-off-locations';
  var PREFIX = 'checklist-custom-';

  function slugify(str) {
    return (
      String(str || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'job'
    );
  }

  function readRegistry() {
    try {
      var raw = localStorage.getItem(REGISTRY_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeRegistry(arr) {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(arr));
  }

  function findByStorageKey(storageKey) {
    var reg = readRegistry();
    for (var i = 0; i < reg.length; i++) {
      if (reg[i].storageKey === storageKey) return reg[i];
    }
    return null;
  }

  // Reuses the same key for a repeat job at the same name (so its history
  // accumulates together, like a regular location); otherwise mints a fresh one.
  function resolveStorageKey(name) {
    var reg = readRegistry();
    var lower = String(name || '').trim().toLowerCase();
    for (var i = 0; i < reg.length; i++) {
      if (String(reg[i].name || '').trim().toLowerCase() === lower) {
        return reg[i].storageKey;
      }
    }
    var slug = slugify(name);
    var key = PREFIX + slug;
    var used = reg.map(function (r) { return r.storageKey; });
    var n = 2;
    while (used.indexOf(key) >= 0) {
      key = PREFIX + slug + '-' + n;
      n++;
    }
    return key;
  }

  function upsertEntry(entry) {
    var reg = readRegistry();
    var idx = -1;
    for (var i = 0; i < reg.length; i++) {
      if (reg[i].storageKey === entry.storageKey) { idx = i; break; }
    }
    if (idx >= 0) {
      reg[idx] = Object.assign({}, reg[idx], entry);
    } else {
      reg.push(entry);
    }
    writeRegistry(reg);
  }

  function findActiveEntry() {
    var reg = readRegistry();
    for (var i = 0; i < reg.length; i++) {
      var sk = reg[i].storageKey;
      var startedAt = localStorage.getItem(sk + ':startedAt');
      var accumulated = localStorage.getItem(sk + ':accumulatedMs');
      var completed = localStorage.getItem(sk + ':completedAt');
      if ((startedAt || accumulated) && !completed) return reg[i];
    }
    return null;
  }

  global.EtmOneOff = {
    PREFIX: PREFIX,
    slugify: slugify,
    readRegistry: readRegistry,
    writeRegistry: writeRegistry,
    findByStorageKey: findByStorageKey,
    resolveStorageKey: resolveStorageKey,
    upsertEntry: upsertEntry,
    findActiveEntry: findActiveEntry
  };
})(window);
