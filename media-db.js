/**
 * IndexedDB helpers for draft (in-progress) and per–log-entry photos/videos.
 * Draft key: storageKey. Log entry key: storageKey + "::log::" + completedAt.
 */
(function (global) {
  const DB_NAME = 'etm-checklist-photo-db';
  const DB_VERSION = 2;
  const STORE = 'locationPhotos';

  const MAX_ITEMS = 10;
  const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

  function draftKey(sk) {
    return sk;
  }

  function logKey(sk, completedAt) {
    return sk + '::log::' + String(completedAt);
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('no idb'));
        return;
      }
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'locationKey' });
        }
      };
    });
    return dbPromise;
  }

  function rawGet(locationKey) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const r = tx.objectStore(STORE).get(locationKey);
          r.onsuccess = () => {
            const row = r.result;
            if (row && Array.isArray(row.photos)) resolve(row.photos);
            else resolve([]);
          };
          r.onerror = () => reject(r.error);
        })
    );
  }

  function rawPut(locationKey, photos) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          const req = tx.objectStore(STORE).put({ locationKey: locationKey, photos: photos });
          req.onerror = () => reject(req.error);
        })
    );
  }

  function rawDelete(locationKey) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(STORE).delete(locationKey);
        })
    ).catch(() => {});
  }

  /** iOS/Safari often reject structured-clone of live `File` from picker; use standalone Blob. */
  function blobCloneForIDB(blob, mimeHint) {
    if (!(blob instanceof Blob)) return Promise.reject(new Error('not a blob'));
    const FileCtor = global.File;
    if (FileCtor && blob instanceof FileCtor) {
      return blob.arrayBuffer().then((buf) => new Blob([buf], { type: mimeHint || blob.type || '' }));
    }
    return Promise.resolve(blob);
  }

  function photosWithIDBSafeBlobs(photos) {
    return Promise.all(
      (photos || []).map((p) =>
        blobCloneForIDB(p.blob, p.mime)
          .then((b) => Object.assign({}, p, { blob: b }))
          .catch(() => p)
      )
    );
  }

  function resizeImageToJpeg(file, maxW) {
    maxW = maxW || 1920;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('bad image'));
          return;
        }
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('encode'));
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('load'));
      };
      img.src = url;
    });
  }

  /**
   * Mobile Safari often decodes photos more reliably via createImageBitmap than new Image().
   */
  function bitmapToJpegBlob(file, maxW) {
    maxW = maxW || 1920;
    if (typeof global.createImageBitmap !== 'function') {
      return Promise.reject(new Error('no createImageBitmap'));
    }
    return global.createImageBitmap(file).then((bitmap) => {
      let w = bitmap.width;
      let h = bitmap.height;
      if (!w || !h) {
        bitmap.close();
        return Promise.reject(new Error('bad image'));
      }
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('encode'));
          },
          'image/jpeg',
          0.85
        );
      });
    });
  }

  function encodeImageFileToJpegBlob(file, maxW) {
    return resizeImageToJpeg(file, maxW).catch(() => bitmapToJpegBlob(file, maxW));
  }

  const MAX_RAW_IMAGE_FALLBACK_BYTES = 30 * 1024 * 1024;

  /** Never reject — failing promises here broke the whole batch (Promise.all). */
  function rawImageFallbackItem(file) {
    if (file.size > MAX_RAW_IMAGE_FALLBACK_BYTES) return Promise.resolve(null);
    if (typeof file.arrayBuffer === 'function') {
      return file
        .arrayBuffer()
        .then((buf) => ({
          id: genId(),
          blob: new Blob([buf], { type: file.type || 'image/jpeg' }),
          name: file.name,
          mime: file.type || 'image/jpeg',
          kind: 'image',
          addedAt: Date.now()
        }))
        .catch(() => ({
          id: genId(),
          blob: file,
          name: file.name,
          mime: file.type || 'image/jpeg',
          kind: 'image',
          addedAt: Date.now()
        }));
    }
    return Promise.resolve({
      id: genId(),
      blob: file,
      name: file.name,
      mime: file.type || 'image/jpeg',
      kind: 'image',
      addedAt: Date.now()
    });
  }

  function imageFileToDraftItem(file) {
    return encodeImageFileToJpegBlob(file)
      .then((blob) => ({
        id: genId(),
        blob: blob,
        name: file.name,
        mime: 'image/jpeg',
        kind: 'image',
        addedAt: Date.now()
      }))
      .catch(() => rawImageFallbackItem(file));
  }

  /**
   * Many mobile browsers leave `File.type` empty for camera/gallery picks.
   * Fall back on extension so we still attempt import.
   */
  function fileKindFromMimeOrName(file) {
    const t = String(file.type || '').toLowerCase();
    if (t.indexOf('image/') === 0) return 'image';
    if (t.indexOf('video/') === 0) return 'video';
    const base = String(file.name || '').split(/[/\\]/).pop() || '';
    const dot = base.lastIndexOf('.');
    const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
    const imageExt = {
      jpg: 1,
      jpeg: 1,
      png: 1,
      gif: 1,
      webp: 1,
      bmp: 1,
      heic: 1,
      heif: 1,
      avif: 1
    };
    const videoExt = { mp4: 1, webm: 1, mov: 1, m4v: 1, mkv: 1 };
    if (imageExt[ext]) return 'image';
    if (videoExt[ext]) return 'video';
    if (!t || t === 'application/octet-stream') {
      if (file.size > 35 * 1024 * 1024) return 'video';
      return 'image';
    }
    return null;
  }

  /**
   * Append new files to existing photo list (respects MAX_ITEMS and video size).
   */
  function appendMediaFiles(existingPhotos, fileList) {
    const existing = Array.isArray(existingPhotos) ? existingPhotos.slice() : [];
    let room = MAX_ITEMS - existing.length;
    if (room <= 0) return Promise.resolve(existing);

    const files = Array.from(fileList || []);
    const tasks = [];
    for (let i = 0; i < files.length && room > 0; i++) {
      const file = files[i];
      let kind = fileKindFromMimeOrName(file);
      if (!kind) kind = file.size > 35 * 1024 * 1024 ? 'video' : 'image';
      if (kind === 'image') {
        tasks.push(imageFileToDraftItem(file));
        room--;
      } else if (kind === 'video') {
        if (file.size > MAX_VIDEO_BYTES) continue;
        tasks.push(
          Promise.resolve({
            id: genId(),
            blob: file,
            name: file.name,
            mime: file.type || 'video/mp4',
            kind: 'video',
            addedAt: Date.now()
          })
        );
        room--;
      }
    }
    return Promise.all(
      tasks.map((t) =>
        Promise.resolve(t).then(
          (x) => x,
          () => null
        )
      )
    ).then((items) => {
      items.filter(Boolean).forEach((it) => existing.push(it));
      return existing.slice(0, MAX_ITEMS);
    });
  }

  function migrateDraftToLog(sk, completedAt) {
    return rawGet(draftKey(sk)).then((photos) => {
      if (photos.length) {
        return rawPut(logKey(sk, completedAt), photos).then(() =>
          rawDelete(draftKey(sk))
        );
      }
      return rawDelete(draftKey(sk));
    });
  }

  function renameLogEntryKey(sk, oldCompletedAt, newCompletedAt) {
    if (Number(oldCompletedAt) === Number(newCompletedAt)) return Promise.resolve();
    return rawGet(logKey(sk, oldCompletedAt)).then((photos) =>
      rawPut(logKey(sk, newCompletedAt), photos).then(() =>
        rawDelete(logKey(sk, oldCompletedAt))
      )
    );
  }

  function clearAllMediaForStorageKey(sk) {
    const prefixLog = sk + '::log::';
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAllKeys();
          req.onsuccess = () => {
            const keys = req.result || [];
            const toDel = keys.filter(
              (k) => k === sk || (typeof k === 'string' && k.indexOf(prefixLog) === 0)
            );
            if (!toDel.length) {
              resolve();
              return;
            }
            const txw = db.transaction(STORE, 'readwrite');
            toDel.forEach((k) => txw.objectStore(STORE).delete(k));
            txw.oncomplete = () => resolve();
            txw.onerror = () => reject(txw.error);
          };
          req.onerror = () => reject(req.error);
        })
    ).catch(() => {});
  }

  function isVideoItem(p) {
    return (
      p &&
      (p.kind === 'video' ||
        (p.mime && String(p.mime).indexOf('video/') === 0))
    );
  }

  /**
   * Serializes every row in the photo store for backup (data URLs for blobs).
   */
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  function exportAllPhotoRowsSerialized() {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => {
            const rows = req.result || [];
            const work = rows.map((row) =>
              Promise.all(
                (row.photos || []).map((p) =>
                  blobToDataURL(p.blob).then(
                    (dataUrl) => ({
                      id: p.id,
                      name: p.name,
                      mime: p.mime,
                      kind: p.kind,
                      addedAt: p.addedAt,
                      dataUrl: dataUrl
                    }),
                    () => null
                  )
                )
              ).then((photos) => ({
                locationKey: row.locationKey,
                photos: photos.filter(Boolean)
              }))
            );
            Promise.all(work).then(resolve).catch(reject);
          };
          req.onerror = () => reject(req.error);
        })
    );
  }

  function dataURLToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('bad data url');
    }
    const comma = dataUrl.indexOf(',');
    if (comma === -1) throw new Error('bad data url');
    const meta = dataUrl.slice(0, comma);
    const base64 = dataUrl.slice(comma + 1).trim();
    const mimeMatch = meta.match(/^data:([^;,]+)/i);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function clearEntirePhotoStore() {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          const store = tx.objectStore(STORE);
          const req = store.getAllKeys();
          req.onsuccess = () => {
            const keys = req.result || [];
            keys.forEach((k) => store.delete(k));
          };
          req.onerror = () => reject(req.error);
        })
    );
  }

  /**
   * Replaces all rows in the photo store with backup payloads (data URLs → blobs).
   */
  function importSerializedPhotoRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return clearEntirePhotoStore().then(() => {
      let chain = Promise.resolve();
      list.forEach((row) => {
        if (!row || row.locationKey == null || row.locationKey === '') return;
        const key = String(row.locationKey);
        chain = chain.then(() => {
          const photos = [];
          for (const item of row.photos || []) {
            if (!item || !item.dataUrl) continue;
            try {
              const blob = dataURLToBlob(item.dataUrl);
              const mime = item.mime || blob.type || '';
              let kind = item.kind;
              if (!kind) {
                kind = fileKindFromMimeOrName({
                  type: mime,
                  name: item.name || '',
                  size: blob.size
                });
              }
              if (!kind) kind = blob.size > 35 * 1024 * 1024 ? 'video' : 'image';
              photos.push({
                id: item.id || genId(),
                name: item.name || 'media',
                mime: mime || 'application/octet-stream',
                kind: kind,
                addedAt: item.addedAt != null ? item.addedAt : Date.now(),
                blob: blob
              });
            } catch (e) {
              /* skip corrupt attachment */
            }
          }
          return photosWithIDBSafeBlobs(photos).then((clean) => rawPut(key, clean));
        });
      });
      return chain;
    });
  }

  global.EtmMediaDB = {
    MAX_ITEMS: MAX_ITEMS,
    MAX_VIDEO_BYTES: MAX_VIDEO_BYTES,
    draftKey: draftKey,
    logKey: logKey,
    openDB: openDB,
    loadDraft: function (sk) {
      return rawGet(draftKey(sk));
    },
    saveDraft: function (sk, photos) {
      return photosWithIDBSafeBlobs(photos).then((clean) => rawPut(draftKey(sk), clean));
    },
    clearDraft: function (sk) {
      return rawDelete(draftKey(sk));
    },
    loadLogPhotos: function (sk, completedAt) {
      return rawGet(logKey(sk, completedAt));
    },
    saveLogPhotos: function (sk, completedAt, photos) {
      return photosWithIDBSafeBlobs(photos).then((clean) => rawPut(logKey(sk, completedAt), clean));
    },
    deleteLogPhotos: function (sk, completedAt) {
      return rawDelete(logKey(sk, completedAt));
    },
    migrateDraftToLog: migrateDraftToLog,
    renameLogEntryKey: renameLogEntryKey,
    clearAllMediaForStorageKey: clearAllMediaForStorageKey,
    fileKindFromMimeOrName: fileKindFromMimeOrName,
    appendMediaFiles: appendMediaFiles,
    resizeImageToJpeg: resizeImageToJpeg,
    isVideoItem: isVideoItem,
    exportAllPhotoRowsSerialized: exportAllPhotoRowsSerialized,
    clearEntirePhotoStore: clearEntirePhotoStore,
    importSerializedPhotoRows: importSerializedPhotoRows
  };
})(typeof window !== 'undefined' ? window : this);
