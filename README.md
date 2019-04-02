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
npm install idb-storage
```

CDN:

```html
<script src="https://unpkg.com/idb-storage/dist/idb-storage.min.js"></script>
```

Similar projects
----------------

* [idb-cache](https://addons.mozilla.org/zh-TW/firefox/addon/image-picker/) - A simple key/value cache supporting ages.

Changelog
---------

* 0.1.0

  - First release.
