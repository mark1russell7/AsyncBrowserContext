// The checks of the smoke test (test/smoke/run.ts) and of the build tool test
// (test/bundlers/run.ts). Each check gives "A" when the context is correct.
import { AsyncLocalStorage, Variable } from "async-browser-context";
import { libraryCall } from "fake-dependency";

const storage = new AsyncLocalStorage();
const variable = new Variable();

async function other() {
    await null;
    await null;
}

/** The context after an `await` in the same expression, while another context operates. */
async function inExpression() {
    void storage.run("B", other);
    return storage.run("A", async () => ({ first : await null, value : storage.getStore() }).value);
}

/** The context in a callback of a dependency in `node_modules`, after the awaits of the dependency. */
async function inDependency() {
    void variable.run("B", other);
    return variable.run("A", async () => await libraryCall(() => variable.get()));
}

function* numbers() {
    yield variable.get();
}

/** Rule C5: a generator body gets the context of the call that made the generator. */
function generator() {
    const created = variable.run("A", () => numbers());
    return variable.run("B", () => created.next().value);
}

/** An event that the browser dispatches gives the context of the registration. */
function browserEvent() {
    return new Promise((resolve) => {
        variable.run("A", () => {
            const image = new Image();
            image.onload = () => resolve(variable.get());
            image.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        });
    });
}

export async function runChecks() {
    return {
        inExpression : await inExpression(),
        inDependency : await inDependency(),
        generator : generator(),
        browserEvent : await browserEvent(),
    };
}
