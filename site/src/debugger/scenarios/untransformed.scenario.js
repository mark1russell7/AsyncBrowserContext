/**
 * @title Code without the transform
 * @summary A dependency without the transform uses a native await, so its callback gets no context. It cannot get the context of a different request. Bind the callback at the boundary, and the callback gets the context of its request.
 * @order 6
 */
import { AsyncLocalStorage } from "async-browser-context";

const requestId = new AsyncLocalStorage();

await requestId.run("r-1", async () => {
    const lost = await untransformedLoad(() => {
        return requestId.getStore();
    });
    log("without bind():", lost);
    const kept = await untransformedLoad(AsyncLocalStorage.bind(() => {
        return requestId.getStore();
    }));
    log("with bind():", kept);
    log("after the await:", requestId.getStore());
});
