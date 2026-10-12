import "../styles/global.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodeEditor } from "./CodeEditor";

let container : HTMLDivElement;
let root : Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
});

function Editor({ initial } : { initial : string }) {
    const [value, setValue] = useState(initial);
    return <CodeEditor value={value} onChange={setValue} onRun={() => undefined} lines={[]} label="Code" />;
}

function render(initial : string) : HTMLTextAreaElement {
    flushSync(() => root.render(<Editor initial={initial} />));
    const textarea = container.querySelector("textarea");
    if (!textarea) throw new Error("No editor");
    textarea.focus();
    return textarea;
}

function press(textarea : HTMLTextAreaElement, key : string, init : KeyboardEventInit = {}) : void {
    flushSync(() => textarea.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles : true, cancelable : true, ...init })));
}

describe("the code editor", () => {
    it("indents with Tab and keeps the undo history", () => {
        const textarea = render("log(1);");
        textarea.setSelectionRange(0, 0);
        press(textarea, "Tab");
        expect(textarea.value).toBe("    log(1);");
        expect(textarea.selectionStart).toBe(4);
        flushSync(() => document.execCommand("undo"));
        expect(textarea.value).toBe("log(1);");
    });

    it("gives a new line the indent of the line before it", () => {
        const textarea = render("if (a) {");
        textarea.setSelectionRange(8, 8);
        press(textarea, "Enter");
        expect(textarea.value).toBe("if (a) {\n    ");
    });

    it("leaves Enter to the input method during a composition", () => {
        const textarea = render("abc");
        textarea.setSelectionRange(3, 3);
        press(textarea, "Enter", { isComposing : true });
        expect(textarea.value).toBe("abc");
    });
});
