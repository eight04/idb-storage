/* eslint-env browser */
const {createLock, createLockPool} = require("@eight04/read-write-lock");

const IS_IOS = typeof navigator !== "undefined" &&
  /iP(hone|(o|a)d);/.test(navigator.userAgent);
  
function blobToBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader;
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("failed to convert Blob to ArrayBuffer"));
    reader.readAsArrayBuffer(blob);
  });
}

function waitSuccess(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IDB request failed"));
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
          transaction.onerror = () => reject(transaction.error || new Error("IDB transaction failed"));
        })
      ]);
      return result;
    });
  }
  
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onerror = () => reject(request.error || new Error("IDB open failed"));
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
  const metaCache = new Map;
  const dbLock = createLock();
  const keyLock = createLockPool();
  let ready;
  return ensureReady({
    set,
    delete: delete_,
    deleteMany,
    get,
    getMeta,
    stackUp,
    clear,
    clearAll
  });
  
  function ensureReady(api) {
    for (const [key, fn] of Object.entries(api)) {
      api[key] = (...args) => {
        if (!ready) {
          ready = init();
        }
        return ready.then(() => fn(...args));
      };
    }
    return api;
  }
  
  function init() {
    return connection.startTransaction(["metadata"], "readonly", async transaction => {
      const store = transaction.objectStore("metadata");
      const [keys, values] = await Promise.all([
        waitSuccess(store.getAllKeys()),
        waitSuccess(store.getAll())
      ]);
      for (let i = 0; i < keys.length; i++) {
        metaCache.set(keys[i], values[i]);
      }
    });
  }
  
  function set(key, value, meta) {
    return dbLock.read(() => 
      keyLock.write([key], async () => {
        const oldMeta = metaCache.get(key);
        if (oldMeta) {
          if (conflictAction === "throw") {
            throw new Error(`idb-storage key conflict: ${key}`);
          } else if (conflictAction === "ignore") {
            return oldMeta;
          } else if (conflictAction === "stack") {
            return await _stackUp(key);
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
        const newMeta = Object.assign({}, oldMeta, meta);
        await connection.startTransaction(["metadata", "resource"], "readwrite", transaction => {
          const metaStore = transaction.objectStore("metadata");
          const resourceStore = transaction.objectStore("resource");
          metaStore.put(newMeta, key);
          resourceStore.put(value, key);
        });
        metaCache.set(key, newMeta);
        return newMeta;
      })
    );
  }
  
  function delete_(key) {
    return _deleteMany([key]);
  }
  
  function deleteMany(keys) {
    return _deleteMany(keys);
  }
  
  function _deleteMany(keys, force = false) {
    return dbLock.read(() =>
      keyLock.write(new Set(keys), async () => {
        const newMetas = new Map;
        await connection.startTransaction(["metadata", "resource"], "readwrite", transaction => {
          const metaStore = transaction.objectStore("metadata");
          const resourceStore = transaction.objectStore("resource");
          for (let i = 0; i < keys.length; i++) {
            const oldMeta = metaCache.get(keys[i]);
            if (!oldMeta) {
              continue;
            }
            if (force || !oldMeta.stack) {
              metaStore.delete(keys[i]);
              resourceStore.delete(keys[i]);
              newMetas.set(keys[i], null);
              continue;
            }
            const newMeta = newMetas.get(keys[i]) || Object.assign({}, oldMeta);
            newMeta.stack--;
            metaStore.put(newMeta, keys[i]);
            newMetas.set(keys[i], newMeta);
          }
        });
        for (const [key, newMeta] of newMetas.entries()) {
          if (newMeta) {
            metaCache.set(key, newMeta);
          } else {
            metaCache.delete(key);
          }
        }
      })
    );
  }
  
  function clear() {
    return _deleteMany([...metaCache.keys()], true);
  }
  
  function clearAll() {
    return dbLock.write(async () => {
      // we don't need key lock since the entire db is locked.
      await connection.startTransaction(["metadata", "resource"], "readwrite", transaction => {
        const metaStore = transaction.objectStore("metadata");
        const resourceStore = transaction.objectStore("resource");
        metaStore.clear();
        resourceStore.clear();
      });
      metaCache.clear();
    });
  }
  
  function get(key) {
    return dbLock.read(() =>
      keyLock.read([key], async () => {
        const oldMeta = metaCache.get(key);
        if (!oldMeta) {
          throw new Error(`missing key: ${key}`);
        }
        const value = await connection.startTransaction(["resource"], "readonly", transaction => {
          const store = transaction.objectStore("resource");
          return waitSuccess(store.get(key));
        });
        if (oldMeta.blobType != null) {
          return new Blob([value], {type: oldMeta.blobType});
        }
        return value;
      })
    );
  }
  
  function getMeta(key) {
    return dbLock.read(() =>
      keyLock.read([key], () => {
        const oldMeta = metaCache.get(key);
        if (!oldMeta) {
          throw new Error(`missing key: ${key}`);
        }
        return oldMeta;
      })
    );
  }
  
  function stackUp(key) {
    return dbLock.read(() =>
      keyLock.write([key], () => _stackUp(key))
    );
  }
  
  async function _stackUp(key) {
    const oldMeta = metaCache.get(key);
    if (!oldMeta) {
      throw new Error(`missing key: ${key}`);
    }
    const newMeta = Object.assign({}, oldMeta);
    newMeta.stack++;
    await connection.startTransaction(["metadata"], "readwrite", transaction => {
      const store = transaction.objectStore("metadata");
      store.put(newMeta, key);
    });
    metaCache.set(key, newMeta);
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
  createIDBStorage
};
