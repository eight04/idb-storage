/* eslint-env mocha */

const assert = require("assert");
const {createLock} = require("..");
const {delay} = require("./util");

describe("lock", () => {
  it("use", async () => {
    const lock = createLock();
    const q = [];
    lock.use(async () => {
      q.push(1);
      await delay(100);
      q.push(2);
    });
    lock.use(() => {
      q.push(3);
    });
    await lock.use(() => {});
    assert.deepStrictEqual(q, [1, 2, 3]);
  });
  
  it("acquire", async () => {
    const lock = createLock();
    const q = [];
    lock.acquire().then(release => {
      q.push(1);
      setTimeout(() => {
        q.push(2);
        release();
      }, 100);
    });
    lock.acquire().then(release => {
      q.push(3);
      release();
    });
    await lock.use(() => {});
    assert.deepStrictEqual(q, [1, 2, 3]);
  });
});
