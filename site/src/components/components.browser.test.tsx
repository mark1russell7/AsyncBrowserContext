import "../styles/global.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventRuleDemo } from "../explore/EventRuleDemo";
import { CodeBlock } from "./CodeBlock/CodeBlock";
import { MarkdownTable, ScrollTable } from "./ScrollTable/ScrollTable";

let container : HTMLDivElement;
let root : Root;

beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "320px";
    document.body.append(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
    vi.restoreAllMocks();
});

describe("ScrollTable", () => {
    it("is a named region with a tab stop only when the table scrolls", async () => {
        flushSync(() => root.render(
            <>
                <h2>The narrow table</h2>
                <MarkdownTable><tbody><tr><td>One</td></tr></tbody></MarkdownTable>
                <h3>The wide table</h3>
                <MarkdownTable><tbody><tr><td style={{ whiteSpace : "nowrap" }}>{"A long cell ".repeat(20)}</td></tr></tbody></MarkdownTable>
                <ScrollTable label="Given name"><table><caption>The caption</caption><tbody><tr><td style={{ minWidth : "900px" }}>Wide</td></tr></tbody></table></ScrollTable>
            </>,
        ));
        const [narrow, wide, named] = [...container.querySelectorAll("table")].map(table => table.parentElement);
        await vi.waitFor(() => expect(wide?.getAttribute("role")).toBe("region"));
        expect(wide?.getAttribute("aria-label")).toBe("The wide table");
        expect(wide?.tabIndex).toBe(0);
        expect(narrow?.hasAttribute("role")).toBe(false);
        expect(narrow?.hasAttribute("tabindex")).toBe(false);
        expect(narrow?.hasAttribute("aria-label")).toBe(false);
        expect(named?.getAttribute("aria-label")).toBe("Given name");
    });

    it("takes the name from the caption of the table", async () => {
        flushSync(() => root.render(
            <MarkdownTable><caption>Results of the probes</caption><tbody><tr><td style={{ minWidth : "900px" }}>Wide</td></tr></tbody></MarkdownTable>,
        ));
        const wrapper = container.querySelector("table")?.parentElement;
        await vi.waitFor(() => expect(wrapper?.getAttribute("aria-label")).toBe("Results of the probes"));
    });
});

describe("CodeBlock", () => {
    it("tells a screen reader that the code is on the clipboard", async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, "clipboard", { configurable : true, value : { writeText } });
        flushSync(() => root.render(<CodeBlock><code>npm install</code></CodeBlock>));
        const live = container.querySelector("[aria-live='polite']");
        expect(live?.textContent).toBe("");
        container.querySelector("button")?.click();
        await vi.waitFor(() => expect(live?.textContent).toBe("The code is on the clipboard."));
        expect(writeText).toHaveBeenCalledWith("npm install");
        expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Copy the code");
    });
});

describe("EventRuleDemo", () => {
    it("has its live region before the first click", () => {
        flushSync(() => root.render(<EventRuleDemo />));
        const log = container.querySelector("ol[aria-live='polite']");
        expect(log).not.toBeNull();
        expect(log?.children).toHaveLength(0);
    });
});
