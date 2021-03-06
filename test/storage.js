/* eslint-env mocha */
const assert = require("assert");
const {createIDBStorage} = require("..");
const {delay} = require("./util");

before(function () {
  // this is slow on my laptop...
  this.timeout(8000);
  require("fake-indexeddb/auto");
});

describe("IDBStorage", () => {
  let storage;
  
  beforeEach(() => {
    storage = createIDBStorage({name: "my-storage"});
  });
  
  afterEach(() => {
    return storage.clearAll();
  });
  
  it("set, get, getMeta, delete", async () => {
    const meta = await storage.set("foo", "bar", {width: 10, height: 20});
    const meta2 = await storage.getMeta("foo");
    assert.deepStrictEqual(meta, meta2);
    assert.equal(meta.width, 10);
    assert.equal(meta.height, 20);
    const data = await storage.get("foo");
    assert.equal(data, "bar");
    await storage.delete("foo");
    await assert.rejects(storage.get("foo"));
    await assert.rejects(storage.getMeta("foo"));
  });
  
  it("stackUp", async () => {
    const {stack} = await storage.set("foo", "bar");
    const {stack: stack2} = await storage.stackUp("foo");
    assert.equal(stack, stack2 - 1);
    await storage.stackUp("foo");
    await storage.delete("foo");
    await storage.get("foo");
    await storage.deleteMany(["foo"]);
    await storage.get("foo");
    await storage.delete("foo");
    await assert.rejects(storage.get("foo"));
  });
  
  it("deleteMany", async () => {
    await Promise.all([
      storage.set("foo", "bar"),
      storage.set("baz", "bak")
    ]);
    await storage.get("foo");
    await storage.get("baz");
    await storage.deleteMany(["foo", "baz"]);
    await assert.rejects(storage.get("foo"));
    await assert.rejects(storage.get("baz"));
  });
  
  it("deleteMany: duplicated keys", async () => {
    await storage.deleteMany(["foo", "foo"]);
  });
  
  it("handle empty slots", async () => {
    // throw
    await assert.rejects(storage.get("not-exist-key"));
    await assert.rejects(storage.stackUp("not-exist-key-2"));
    // fail
    await storage.delete("not-exist-key-3");
    await storage.deleteMany(["not-exist-key-4", "not-exist-key-5"]);
  });
  
  it("resource getter", async () => {
    function doSet() {
      return storage.set("foo", async () => {
        await delay(100);
        return {resource: "bar"};
      });
    }
    const p1 = doSet();
    const p2 = doSet();
    assert(await p1);
    await assert.rejects(p2);
  });
  
  it("clear", async () => {
    await storage.set("foo", "bar");
    await storage.clear();
    await assert.rejects(storage.get("foo"));
  });
  
  it("clearAll", async () => {
    await storage.set("foo", "bar");
    await storage.clearAll();
    await assert.rejects(storage.get("foo"));
  });
  
  it("operation queue", async () => {
    storage.set("foo", "bar");
    storage.delete("foo");
    storage.set("foo", "baz");
    assert.equal(await storage.get("foo"), "baz");
    storage.clearAll();
    storage.set("bar", "bak");
    assert.equal(await storage.get("bar"), "bak");
    await storage.delete("bar");
  });
  
  it("parallel operations", async () => {
    let fooRunning = false;
    let barRunning = false;
    const p1 = storage.set("foo", async () => {
      fooRunning = true;
      await delay(100);
      assert(barRunning);
      return {resource: "foo"};
    });
    const p2 = storage.set("bar", async () => {
      assert(fooRunning);
      barRunning = true;
      await delay(100);
      return {resource: "bar"};
    });
    await p1;
    await p2;
    await storage.clearAll();
  });
});

describe("conflictAction", () => {
  it("throw", async () => {
    const storage = createIDBStorage({
      name: "conflict-throw",
      conflictAction: "throw"
    });
    await storage.set("foo", "bar");
    await assert.rejects(storage.set("foo", "baz"));
    assert.equal(await storage.get("foo"), "bar");
  });
  
  it("ignore", async () => {
    const storage = createIDBStorage({
      name: "conflict-ignore",
      conflictAction: "ignore"
    });
    await storage.set("foo", "bar");
    await storage.set("foo", "baz");
    assert.equal(await storage.get("foo"), "bar");
  });
  
  it("replace", async () => {
    const storage = createIDBStorage({
      name: "conflict-replace",
      conflictAction: "replace"
    });
    await storage.set("foo", "bar");
    await storage.set("foo", "baz");
    assert.equal(await storage.get("foo"), "baz");
  });
  
  it("stack", async () => {
    const storage = createIDBStorage({
      name: "conflict-stack",
      conflictAction: "stack"
    });
    await storage.set("foo", "bar");
    await storage.set("foo", "baz");
    assert.equal(await storage.get("foo"), "bar");
    await storage.delete("foo");
    assert.equal(await storage.get("foo"), "bar");
    await storage.delete("foo");
    assert.rejects(storage.get("foo"));
  });
});

describe("persistent", () => {
  it("set", async () => {
    const storage = createIDBStorage({
      name: "my-storage"
    });
    await storage.set("foo", "bar");
  });
  
  it("get", async () => {
    const storage = createIDBStorage({
      name: "my-storage"
    });
    assert.equal(await storage.get("foo"), "bar");
  });
});
