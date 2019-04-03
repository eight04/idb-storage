/* eslint-env browser */

const IS_IOS = typeof navigator !== "undefined" &&
  /iP(hone|(o|a)d);/.test(navigator.userAgent);
  
function blobToBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader;
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

function createLock() {
  let process = Promise.resolve();
  return {use, acquire};
  
  function use(cb) {
    const result = process.then(cb);
    process = result.catch(() => {});
    return result;
  }
  
  function acquire() {
    let resolve;
    const acquired = process.then(() => resolve);
    process = new Promise(_resolve => {
      resolve = _resolve;
    });
    return acquired;
  }
}

function waitSuccess(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
}

function createDBConnection({name, version, onupgradeneeded, indexedDB = findIndexedDB()}) {
  if (!name) {
    throw new Error("missing storage name");
  }
  if (!indexedDB) {
    throw new Error("missing indexedDB");
  }
  let ready;
  let user = 0;
  return {use, startTransaction};
  
  async function use(cb) {
    user++;
    if (!ready) {
      ready = open();
    }
    const db = await ready;
    let err;
    let result;
    try {
      result = await cb(db);
    } catch (_err) {
      err = _err;
    }
    user--;
    if (!user) {
      db.close();
      ready = null;
    }
    if (err) {
      throw err;
    }
    return result;
  }
  
  function startTransaction(scope, mode, cb) {
    return use(async db => {
      const transaction = db.transaction(scope, mode);
      const [result] = await Promise.all([
        cb(transaction),
        new Promise((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = reject;
        })
      ]);
      return result;
    });
  }
  
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onerror = reject;
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = onupgradeneeded;
    });
  }
}

function createIDBStorage({
  name,
  conflictAction = "throw", // throw, stack, replace, ignore
  indexedDB
} = {}) {
  const connection = createDBConnection({
    indexedDB,
    name,
    version: 1,
    onupgradeneeded
  });
  const keyCache = new Map;
  let ready;
  return ensureReady({
    set,
    delete: delete_,
    deleteMany,
    get,
    getMeta,
    stackUp
  });
  
  function ensureReady(target) {
    for (const [key, fn] of Object.entries(target)) {
      target[key] = async (...args) => {
        if (!ready) {
          ready = init();
        }
        await ready;
        return await fn(...args);
      };
    }
    return target;
  }
  
  function init() {
    return connection.startTransaction(["metadata"], "readonly", async transaction => {
      const store = transaction.objectStore("metadata");
      const [keys, values] = await Promise.all([
        waitSuccess(store.getAllKeys()),
        waitSuccess(store.getAll())
      ]);
      for (let i = 0; i < keys.length; i++) {
        keyCache.set(keys[i], buildCache(values[i]));
      }
    });
  }
  
  function buildCache(meta) {
    return {
      lock: createLock(),
      meta
    };
  }
  
  function withKey(key, cb) {
    let cache = keyCache.get(key);
    if (!cache) {
      cache = buildCache();
      keyCache.set(key, cache);
    }
    return cache.lock.use(() => cb(cache));
  }
  
  async function withKeys(keys, cb) {
    const caches = keys.map(key => {
      let cache = keyCache.get(key);
      if (!cache) {
        cache = buildCache();
        keyCache.set(key, cache);
      }
      return cache;
    });
    const releasers = await Promise.all(caches.map(c => c.lock.acquire()));
    let err;
    let result;
    try {
      result = await cb(caches);
    } catch (_err) {
      err = _err;
    }
    for (const release of releasers) {
      release();
    }
    if (err) {
      throw err;
    }
    return result;
  }
  
  function set(key, value, meta) {
    return withKey(key, async cache => {
      if (cache.meta) {
        if (conflictAction === "throw") {
          throw new Error(`idb-storage key conflict: ${key}`);
        } else if (conflictAction === "ignore") {
          return cache.meta;
        } else if (conflictAction === "stack") {
          return await _stackUp(key, cache);
        }
      }
      if (typeof value === "function") {
        ({resource: value, meta} = await value());
      }
      if (!meta) {
        meta = {};
      }
      meta.stack = 0;
      if (IS_IOS && value instanceof Blob) {
        meta.blobType = value.type;
        value = await blobToBuffer(value);
      } else {
        meta.blobType = null;
      }
      meta.size = value.size || value.byteLength || value.length; // string?
      const newMeta = Object.assign({}, cache.meta, meta);
      await connection.startTransaction(["metadata", "resource"], "readwrite", transaction => {
        const metaStore = transaction.objectStore("metadata");
        const resourceStore = transaction.objectStore("resource");
        metaStore.put(newMeta, key);
        resourceStore.put(value, key);
      });
      cache.meta = newMeta;
      return newMeta;
    });
  }
  
  function delete_(key) {
    return withKey(key, async cache => {
      if (!cache.meta) {
        return;
      }
      if (cache.meta.stack) {
        cache.meta.stack--;
        return;
      }
      await connection.startTransaction(["metadata", "resource"], "readwrite", transaction => {
        const metaStore = transaction.objectStore("metadata");
        const resourceStore = transaction.objectStore("resource");
        metaStore.delete(key);
        resourceStore.delete(key);
      });
      cache.meta = null;
    });
  }
  
  function deleteMany(keys) {
    return withKeys(keys, async caches => {
      await connection.startTransaction(["metadata", "resource"], "readwrite", transaction => {
        const metaStore = transaction.objectStore("metadata");
        const resourceStore = transaction.objectStore("resource");
        for (let i = 0; i < keys.length; i++) {
          if (!caches[i].meta || caches[i].meta.stack) {
            continue;
          }
          metaStore.delete(keys[i]);
          resourceStore.delete(keys[i]);
        }
      });
      for (const cache of caches) {
        if (!cache.meta) {
          continue;
        }
        if (cache.meta.stack) {
          cache.meta.stack--;
        } else {
          cache.meta = null;
        }
      }
    });
  }
  
  function get(key) {
    return withKey(key, async cache => {
      if (!cache.meta) {
        throw new Error(`missing key: ${key}`);
      }
      const value = await connection.startTransaction(["resource"], "readonly", transaction => {
        const store = transaction.objectStore("resource");
        return waitSuccess(store.get(key));
      });
      if (cache.meta.blobType != null) {
        return new Blob([value], cache.meta.blobType);
      }
      return value;
    });
  }
  
  function getMeta(key) {
    return withKey(key, cache => {
      if (!cache.meta) {
        throw new Error(`missing key: ${key}`);
      }
      return cache.meta;
    });
  }
  
  function stackUp(key) {
    return withKey(key, cache => _stackUp(key, cache));
  }
  
  async function _stackUp(key, cache) {
    if (!cache.meta) {
      throw new Error(`missing key: ${key}`);
    }
    const newMeta = Object.assign({}, cache.meta);
    newMeta.stack++;
    await connection.startTransaction(["metadata"], "readwrite", transaction => {
      const store = transaction.objectStore("metadata");
      store.put(newMeta, key);
    });
    cache.meta = newMeta;
    return newMeta;
  }
  
  function onupgradeneeded(e) {
    if (e.oldVersion < 1) {
      e.target.result.createObjectStore("metadata");
      e.target.result.createObjectStore("resource");
    }
  }
}

function findIndexedDB() {
  /* global webkitIndexedDB mozIndexedDB OIndexedDB msIndexedDB */
  return typeof indexedDB !== "undefined" ? indexedDB :
    typeof webkitIndexedDB !== "undefined" ? webkitIndexedDB :
    typeof mozIndexedDB !== "undefined" ? mozIndexedDB :
    typeof OIndexedDB !== "undefined" ? OIndexedDB :
    typeof msIndexedDB !== "undefined" ? msIndexedDB : null;
}

module.exports = {
  createLock,
  createIDBStorage
};
