/**
 * @title Generators
 * @summary A generator keeps the context of the call that made it. Each next() call runs the generator in that context, also from a different context.
 * @order 4
 */
import { AsyncLocalStorage } from "async-browser-context";

const requestId = new AsyncLocalStorage();

function* steps() {
    yield `first step in ${requestId.getStore()}`;
    yield `second step in ${requestId.getStore()}`;
}

const generator = requestId.run("r-1", () => steps());
requestId.run("r-2", () => {
    log(generator.next().value);
});
log(generator.next().value);
