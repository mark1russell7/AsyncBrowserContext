/**
 * @title Snapshots
 * @summary A snapshot keeps the current frame. snapshot.run() sets that frame again, also later and from a different context.
 * @order 5
 */
import { AsyncContext } from "async-browser-context";

const requestId = new AsyncContext.Variable();

const snapshot = requestId.run("r-1", () => {
    return new AsyncContext.Snapshot();
});

await requestId.run("r-2", async () => {
    await sleep(5);
    log("now:", requestId.get());
    snapshot.run(() => {
        log("in the snapshot:", requestId.get());
    });
});
