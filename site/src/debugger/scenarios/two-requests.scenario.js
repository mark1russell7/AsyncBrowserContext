/**
 * @title Two requests at the same time
 * @summary Two request handlers run at the same time and continue in turns. After each await, each handler gets its own request ID again.
 * @order 1
 */
import { AsyncLocalStorage } from "async-browser-context";

const requestId = new AsyncLocalStorage();

async function handle(id, user) {
    await requestId.run(id, async () => {
        log(`[${requestId.getStore()}] load ${user}`);
        const name = await fetchUser(user);
        log(`[${requestId.getStore()}] hello, ${name}`);
        await save(name);
    });
}

async function save(name) {
    await sleep(5);
    log(`[${requestId.getStore()}] saved ${name}`);
}

await Promise.all([
    handle("r-1", "ada"),
    handle("r-2", "grace"),
]);
