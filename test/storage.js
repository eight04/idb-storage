/* eslint-env mocha */
const assert = require("assert");
const {createIDBStorage} = require("..");
const {delay} = require("./util");

before(() => {
  require("fake-indexeddb/auto");
});

describe("IDBStorage", () => {  
  it("set, get, getMeta, delete", async () => {
    const storage = createIDBStorage({
      name: "foo"
    });
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
    const storage = createIDBStorage({
      name: "foo"
    });
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
    const storage = createIDBStorage({
      name: "foo"
    });
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
  
  it("handle empty slots", async () => {
    const storage = createIDBStorage({
      name: "foo"
    });
    // throw
    await assert.rejects(storage.get("not-exist-key"));
    await assert.rejects(storage.stackUp("not-exist-key-2"));
    // fail
    await storage.delete("not-exist-key-3");
    await storage.deleteMany(["not-exist-key-4", "not-exist-key-5"]);
  });
  
  it("resource getter", async () => {
    const storage = createIDBStorage({
      name: "resource-getter"
    });
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
