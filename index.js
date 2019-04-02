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
  return {use};
  
  async function use(cb) {
    user++;
    if (!ready) {
      ready = open();
    }
    const db = await ready;
    let err;
    try {
      await cb(db);
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
  }
  
  function startTransaction(scope, mode, cb) {
    return use(db => {
      const transaction = db.transaction(scope, mode);
      const pending = new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = reject;
      });
      return Promise.all([cb(transaction), pending]);
    });
  }
  
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
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
  return ensureReady({set, delete: delete_, get, getMeta, stackUp});
  
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
  
  async function set(key, value, meta = {}) {
    const cachedMeta = metaCache.get(key);
    let stackUp = false;
    if (cachedMeta) {
      if (conflictAction === "throw") {
        throw new Error(`idb-storage key conflict: ${key}`);
      } else if (conflictAction === "ignore") {
        return;
      } else if (conflictAction === "stack") {
        return await stackUp(key);
      }
    }
    meta.stack = 0;
    if (IS_IOS && value instanceof Blob) {
      meta.blobType = value.type;
      value = await blobToBuffer(value);
    } else {
      meta.blobType = null;
    }
    meta.size = value.size || value.byteLength || value.length; // string?
    const newMeta = Object.assign({}, cachedMeta, meta);
    await connection.startTransaction(["metadata", "resource"], "readwrite", async transaction => {
      const metaStore = transaction.objectStore("metadata");
      const resStore = transaction.objectStore("resStore");
      metaStore.put(key, newMeta);
      resStore.put(key, value);
    });
  }
  
  function delete_(key) {
    
  }
  
  function deleteMany(keys) {
    
  }
  
  function get(key) {
    
  }
  
  function getMeta(key) {
    return metaCache.get(key);
  }
  
  function stackUp(key) {
    
  }
  
  function onupgradeneeded(e) {
    if (e.oldVersion < 1) {
      request.result.createObjectStore("metadata");
      request.result.createObjectStore("resource");
    }
  }
}

function findIndexedDB() {
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
