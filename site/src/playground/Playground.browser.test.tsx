import "../styles/global.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scenarioById } from "../debugger/run";
import { Playground } from "./Playground";

/** The encoding of the "Copy a link" button: Base64URL of the UTF-8 bytes. */
function encode(code : string) : string {
    let binary = "";
    for (const byte of new TextEncoder().encode(code)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let address : string;
let container : HTMLDivElement;
let root : Root;

beforeEach(() => {
    address = location.href;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
    history.replaceState(null, "", address);
});

function render() : void {
    flushSync(() => root.render(<MemoryRouter><Playground /></MemoryRouter>));
}

function button(text : string) : HTMLButtonElement {
    const found = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === text);
    if (!found) throw new Error(`No button "${text}"`);
    return found;
}

/** This function changes the text of the editor as typed text does. */
function type(textarea : HTMLTextAreaElement, value : string) : void {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles : true }));
}

describe("the playground", () => {
    it("does not start the code of a link before the reader selects Run the code", async () => {
        history.replaceState(history.state, "", `#code=${encode("log(\"from the link\");\n")}`);
        render();
        const textarea = container.querySelector("textarea");
        expect(textarea?.value).toBe("log(\"from the link\");\n");
        expect(container.querySelector("[role='status']")?.textContent).toContain("This code comes from a link");
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(container.querySelector("section[aria-label='Context debugger']")).toBeNull();
        expect(container.textContent).not.toContain("The page compiles the code.");

        button("Run the code").click();
        await vi.waitFor(() => {
            if (!container.querySelector("section[aria-label='Context debugger']")) throw new Error("The code did not start");
        }, { timeout : 30_000, interval : 50 });
        expect(container.querySelector("[role='status']")).toBeNull();
    });

    it("loads a scenario again when the reader selects the same scenario a second time", () => {
        render();
        const select = container.querySelector("select");
        const textarea = container.querySelector("textarea");
        if (!select || !textarea) throw new Error("No select or no editor");
        const scenario = scenarioById("nested");
        const choose = () : void => {
            select.value = scenario.id;
            select.dispatchEvent(new Event("change", { bubbles : true }));
        };
        flushSync(choose);
        expect(textarea.value).toBe(scenario.source);
        expect(select.value).toBe("");
        flushSync(() => type(textarea, "log(1);\n"));
        expect(textarea.value).toBe("log(1);\n");
        flushSync(choose);
        expect(textarea.value).toBe(scenario.source);
    });

    it("keeps the state of the history entry when it writes the link into the address", () => {
        history.replaceState({ usr : null, key : "router-key", idx : 0 }, "");
        render();
        button("Copy a link").click();
        expect(location.hash.startsWith("#code=")).toBe(true);
        expect((history.state as { key? : string } | null)?.key).toBe("router-key");
    });
});
