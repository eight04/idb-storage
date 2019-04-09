idb-storage
===========

[![Build Status](https://travis-ci.com/eight04/idb-storage.svg?branch=master)](https://travis-ci.com/eight04/idb-storage)
[![codecov](https://codecov.io/gh/eight04/idb-storage/branch/master/graph/badge.svg)](https://codecov.io/gh/eight04/idb-storage)

A key/value storage system built on top of IndexedDB. Designed for large binary files.

Features
--------

* Store metadata along with the binary to IndexedDB.
* Retrieve metadata and the binary separately.
* Key conflict action.
* Batch operation.
* Operations are queued and operations on the same key share a same lock.

Installation
------------

npm:

```
npm install @eight04/idb-storage
```
```js
const {createIDBStorage} = require("@eight04/idb-storage");

const storage = createIDBStorage({name: "my-storage"});
...
```

CDN:

```html
<script src="https://unpkg.com/@eight04/idb-storage/dist/idb-storage.min.js"></script>
```
```js
/* global idbStorage */
const storage = idbStorage.createIDBStorage({name: "my-storage"});
...
```

Metadata cache
--------------

This library caches metadata in the memory. This allows us to check the resource existency without accessing the database. However, the downside is that you can't create multiple instances connecting to the same database at the same time, because the cache is not shared between them and will get out of sync quickly.

API
----

This module exports following members:

* `createIDBStorage` - a factory function which can create a `storage` object.

### createIDBStorage

```js
const storage = createIDBStorage({
  name: String,
  conflictAction: String = "throw"
});
```

`name` is the name of the IndexedDB, which will be sent to `indexedDB.open`.

`conflictAction` controls the behavior of `storage.set` when the key already exists. There are 4 available values:

* `throw` - Throw an error.
* `ignore` - Do nothing. The item won't be put into the database.
* `replace` - Replace the old item.
* `stack` - Increase `stack` property by 1. The item won't be put into the database.

### storage.set

```js
const meta = await storage.set(key, resource, meta = {});
const meta = await storage.set(
  key,
  resourceGetter: async () => ({resource, meta = {}})
);
```

Add or update a resource.

`key` can be any value that can be used as the ID.

`resource` should be a `String`, `Blob`, or `ArrayBuffer`.

`meta` object allows you to save additional information along with the resource. There are 3 properties that will be set automatically by the library:

* `blobType` - on iOS, you can't save `Blob` object to IndexedDB, so the library will convert the blob into array buffer. When reading the resource back, the library checks this field to know whether it should convert the array buffer back to a blob.
* `size` - the size of the resource i.e. `blob.size || arrayBuffer.byteLength || string.length`.
* `stack` - a special property controlling when to delete a resource. When `stack` is greater than 0, calling `storage.delete` won't delete the resource but decrease `stack` by 1.

When the second argument is a function, it is treated as a resource getter. You can use this method to avoid parallel fetching when the function is called multiple times:

```js
function addResource(url) {
  storage.set(url, async () => {
    const r = await fetch(url);
    const blob = await r.blob();
    return {resource: blob};
  });
}

addResource("http://example.com");
addResource("http://example.com");
// the second call will fail with a `key alredy exists` error and `fetch` will
// only be called once.
```

### storage.delete

```js
await storage.delete(key);
```

Delete a resource.

### storage.deleteMany

```js
await storage.delete(keys: Array);
```

Delete multiple resources at once. This allows you to delete multiple resources in a single transaction.

If a key appears multiple times, the resource will be deleted multiple times.

### storage.get

```js
const resource = await storage.get(key);
```

Get the resource from the indexedDB.

Throw if the resource doesn't exist.

### storage.getMeta

```js
const meta = await storage.getMeta(key);
```

Get the metadata. Note that the metadata is pre-cached in the memory, so this operation doesn't touch the indexedDB.

Throw if the resource doesn't exist.

### storage.stackUp

```js
await storage.stackUp(key);
```

Increase `stack` property by 1.

Throw if the resource doesn't exist.

### storage.clear

```js
await storage.clear();
```

Clear all resources.

### storage.clearAll

```js
await storage.clearAll();
```

Drop the entire database. This method blocks all other operations.

Similar projects
----------------

* [idb-cache](https://addons.mozilla.org/zh-TW/firefox/addon/image-picker/) - A simple key/value cache supporting ages.

Changelog
---------

* 0.4.1 (Apr 9, 2019)

  - Fix: `deleteMany` hangs if there are duplicated keys.

* 0.4.0 (Apr 5, 2019)

  - Breaking: switch to [@eight04/read-write-lock](https://www.npmjs.com/package/@eight04/read-write-lock).

* 0.3.0 (Apr 4, 2019)

  - Refactor: operation queue.
  - Add: `storage.clearAll`.

* 0.2.3 (Apr 3, 2019)

  - Fix: `storage.delete` is not reliable.
  - Add: `storage.clear`.

* 0.2.2

  - Add: use resource getter in `storage.set`.

* 0.2.1 (Apr 3, 2019)

  - Fix: make sure `storage.set` consistenly returns metadata.

* 0.2.0 (Apr 2, 2019)

  - Breaking: change the package name.

* 0.1.0 (Apr 2, 2019)

  - First release.
