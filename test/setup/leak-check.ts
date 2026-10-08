import { afterEach, expect, inject } from "vitest";
import { store } from "../../src/core/store.js";

/**
 * The leak check (rule C1). After each test, no context stays current. The
 * check is for the browser runtime: on Node.js, the native AsyncLocalStorage
 * keeps the contexts.
 */
afterEach(() => {
    if (inject("runtime") !== "browser") {
        return;
    }
    expect(store.current, "a context stayed current after the test").toBe(store.root);
});
