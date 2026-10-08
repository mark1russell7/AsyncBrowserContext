import { AsyncLocalStorage, Variable } from "async-browser-context";
import { libraryCall } from "fake-dependency";

const storage = new AsyncLocalStorage();
const variable = new Variable();

async function other() {
    await null;
    await null;
}

async function inExpression() {
    void storage.run("B", other);
    return storage.run("A", async () => ({ first : await null, value : storage.getStore() }).value);
}

async function inDependency() {
    void variable.run("B", other);
    return variable.run("A", async () => await libraryCall(() => variable.get()));
}

function* numbers() {
    yield variable.get();
}

function generator() {
    const created = variable.run("A", () => numbers());
    return variable.run("B", () => created.next().value);
}

function browserEvent() {
    return new Promise((resolve) => {
        variable.run("A", () => {
            const image = new Image();
            image.onload = () => resolve(variable.get());
            image.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        });
    });
}

const results = {
    inExpression : await inExpression(),
    inDependency : await inDependency(),
    generator : generator(),
    browserEvent : await browserEvent(),
};
window.__results = results;
document.body.textContent = JSON.stringify(results);
