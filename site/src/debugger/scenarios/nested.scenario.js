/**
 * @title Nested contexts
 * @summary Each run() makes a frame below the current frame. get() searches from the current frame up to the root. The nearest frame that sets the variable gives the value.
 * @order 2
 */
import { AsyncContext } from "async-browser-context";

const requestId = new AsyncContext.Variable();
const userId = new AsyncContext.Variable();

await requestId.run("r-1", async () => {
    await userId.run("u-7", async () => {
        await sleep(5);
        log("outer:", requestId.get(), userId.get());
        requestId.run("r-1a", () => {
            log("inner:", requestId.get(), userId.get());
        });
        log("outer again:", requestId.get());
    });
});
log("after run():", requestId.get());
