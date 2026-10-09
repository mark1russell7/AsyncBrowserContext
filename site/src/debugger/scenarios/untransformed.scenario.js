/**
 * @title Code without the transform
 * @summary A dependency that the transform did not change uses a native await. Its code after that await gets the root frame. The code of the scenario gets its frame again after its own await.
 * @order 6
 */
import { AsyncLocalStorage } from "async-browser-context";

const requestId = new AsyncLocalStorage();

await requestId.run("r-1", async () => {
    const seen = await untransformedLoad(() => {
        return requestId.getStore();
    });
    log("in the dependency:", seen);
    log("after the await:", requestId.getStore());
});
