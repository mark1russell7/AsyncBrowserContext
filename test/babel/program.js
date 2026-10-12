// The program of the Babel test (test/babel/run.ts). Each Babel version
// transforms it with the preset, and the test starts the output on the
// browser runtime in Node.js. Two requests run at the same time.
import { AsyncLocalStorage } from "async-browser-context/browser";

const store = new AsyncLocalStorage();

function later(value) {
    return new Promise((resolve) => setTimeout(() => resolve(value), 1));
}

async function inner(value) {
    const seen = { before : store.getStore(), after : await later(value) };
    return [seen.before, seen.after, store.getStore()];
}

function* steps() {
    yield store.getStore();
}

async function* ticks() {
    await null;
    yield store.getStore();
}

class Base {
    async read() {
        await null;
        return store.getStore();
    }
}

class Child extends Base {
    async read() {
        await null;
        return `child:${await super.read()}`;
    }
}

export async function main() {
    const request = (id) => store.run(id, async () => {
        const fromAwait = await inner(id);
        const generator = steps();
        const fromGenerator = await store.run("other", async () => {
            await null;
            return generator.next().value;
        });
        let fromAsyncGenerator;
        for await (const value of ticks()) fromAsyncGenerator = value;
        const fromSuper = await new Child().read();
        return { fromAwait, fromGenerator, fromAsyncGenerator, fromSuper };
    });
    return Promise.all([request("a"), request("b")]);
}
