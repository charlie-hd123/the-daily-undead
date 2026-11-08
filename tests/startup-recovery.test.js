import test from "node:test";
import assert from "node:assert/strict";

import { clearStartupRecovery, recoverFailedStartup } from "../js/startup-recovery.js";

function browser(saved = new Map()) {
  const windowObject = new EventTarget();
  windowObject.document = new EventTarget();
  windowObject.document.visibilityState = "visible";
  windowObject.navigator = { onLine: true };
  windowObject.reloads = 0;
  windowObject.location = {
    protocol: "https:",
    reload() { windowObject.reloads += 1; },
  };
  windowObject.sessionStorage = {
    getItem(key) { return saved.get(key) ?? null; },
    setItem(key, value) { saved.set(key, value); },
    removeItem(key) { saved.delete(key); },
  };
  return windowObject;
}

test("failed startup reloads once across documents until the game starts successfully", () => {
  const saved = new Map();
  const firstPage = browser(saved);
  assert.equal(recoverFailedStartup(firstPage), true);
  assert.equal(firstPage.reloads, 1);

  const reloadedPage = browser(saved);
  assert.equal(recoverFailedStartup(reloadedPage), false);
  assert.equal(reloadedPage.reloads, 0);

  clearStartupRecovery(reloadedPage);
  assert.equal(recoverFailedStartup(browser(saved)), true);
});

test("startup recovery waits until the tab is visible and online", () => {
  const page = browser();
  page.document.visibilityState = "hidden";
  page.navigator.onLine = false;
  assert.equal(recoverFailedStartup(page), false);

  page.navigator.onLine = true;
  page.dispatchEvent(new Event("online"));
  assert.equal(page.reloads, 0);

  page.document.visibilityState = "visible";
  page.document.dispatchEvent(new Event("visibilitychange"));
  page.dispatchEvent(new Event("online"));
  assert.equal(page.reloads, 1);
});

test("startup recovery waits for a connection even when the tab is already visible", () => {
  const page = browser();
  page.navigator.onLine = false;
  assert.equal(recoverFailedStartup(page), false);
  assert.equal(page.reloads, 0);

  page.navigator.onLine = true;
  page.dispatchEvent(new Event("online"));
  assert.equal(page.reloads, 1);
});

test("startup recovery leaves the error screen available if the reload guard cannot be stored", () => {
  const page = browser();
  page.sessionStorage.setItem = () => { throw new Error("Storage unavailable"); };
  assert.equal(recoverFailedStartup(page), false);
  assert.equal(page.reloads, 0);
});
