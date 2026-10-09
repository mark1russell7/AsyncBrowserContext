/**
 * @title Timers and events
 * @summary A callback gets the context of the code that registered it. An event listener gets the context of the dispatch. A dispatch from the root frame gives the context of the registration.
 * @order 3
 */
import { AsyncLocalStorage } from "async-browser-context";

const requestId = new AsyncLocalStorage();
const button = new EventTarget();

requestId.run("r-1", () => {
    setTimeout(() => log("timer:", requestId.getStore()), 10);
    queueMicrotask(() => log("microtask:", requestId.getStore()));
    button.addEventListener("click", () => {
        log("click:", requestId.getStore());
    });
});

const click = () => button.dispatchEvent(new Event("click"));
requestId.run("r-2", click);
click();
await sleep(20);
