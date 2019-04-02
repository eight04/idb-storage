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
* Operations on the same key are queued.

Installation
------------

npm:

```
npm install @eight04/idb-storage
```

CDN:

```html
<script src="https://unpkg.com/@eight04/idb-storage/dist/idb-storage.min.js"></script>
```

API
----

This module exports two functions:

* `createLock` - create a `lock` object that can be used to queue up async functions.
* `createIDBStorage` - create the `storage` object.

### createIDBStorage

```js
const storage = createIDBStorage({
  name: String,
  conflictAction: String = "throw"
});
```

`name` is the name of the IndexedDB, which will be sent to `indexedDB.open`.

`conflictAction` controls the behavior of `storage.set` when the key is already exists. There are 4 available values:

* `throw` - Throw an error.
* `ignore` - Do nothing. The item won't be put into the database.
* `replace` - Replace the old item.
* `stack` - Increase `stack` property by 1. The item won't be put into the database.

### storage.set

```js
await storage.set(key, resource, meta = {});
```

Add or update a resource.

`key` can be any value that can be used as the ID.

`resource` should be a `String`, `Blob`, or `ArrayBuffer`.

`meta` object allows you to save additional information along with the resource. There are 3 properties that will be set automatically by the library:

* `blobType` - on iOS, you can't save `Blob` object to IndexedDB, so the library will convert the blob into array buffer. When reading the resource back, the library checks this field to know whether it should convert the array buffer back to a blob.
* `size` - the size of the resource i.e. `blob.size || arrayBuffer.byteLength || string.length`.
* `stack` - a special property controling when to delete a resource. When `stack` is greater than 0, calling `storage.delete` won't delete the resource but decrease `stack` by 1.

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

Similar projects
----------------

* [idb-cache](https://addons.mozilla.org/zh-TW/firefox/addon/image-picker/) - A simple key/value cache supporting ages.

Changelog
---------

* 0.2.0 (Apr 2, 2019)

  - Breaking: change package name.

* 0.1.0 (Apr 2, 2019)

  - First release.
