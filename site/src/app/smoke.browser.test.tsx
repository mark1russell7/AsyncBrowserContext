import "../styles/global.css";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bench from "../../public/data/bench.json";
import browsers from "../../public/data/browsers.json";
import mutation from "../../public/data/mutation.json";
import probes from "../../public/data/probes.json";
import { siteContent } from "../content/site-content";
import { createMemoryDataSource } from "../data/source";
import type { SiteDataMap } from "../data/types";
import { createMemoryPreferenceStore } from "../theme/preferences";
import { createAppRoutes } from "./routes";
import { siteSections } from "./sections";
import { SiteProviders, type SiteServices } from "./SiteProviders";

const DATA = { probes, mutation, browsers, bench } as unknown as SiteDataMap;

const APP_PATHS = ["/", "/no/such/page", "/docs/no-such-page"];

const CONTENT_PATHS = siteContent.sections().flatMap(section => siteContent.pages(section).map(page => page.path));

function services() : SiteServices {
    return {
        sections : siteSections,
        content : siteContent,
        data : createMemoryDataSource(DATA),
        preferences : createMemoryPreferenceStore(),
    };
}

const problems : string[] = [];
const onError = (event : ErrorEvent) : void => { problems.push(`error event: ${event.message}`); };
const onRejection = (event : PromiseRejectionEvent) : void => { problems.push(`unhandled rejection: ${String(event.reason)}`); };

let container : HTMLDivElement;
let root : Root;

beforeEach(() => {
    problems.length = 0;
    vi.spyOn(console, "error").mockImplementation((...args : unknown[]) => {
        problems.push(`console.error: ${args.map(String).join(" ")}`);
    });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    vi.restoreAllMocks();
});

/** This function renders the app at `path` and waits until the page has a heading and nothing loads. */
async function renderPath(path : string) : Promise<void> {
    const router = createMemoryRouter(createAppRoutes(siteSections), { initialEntries : [path] });
    root.render(
        <SiteProviders services={services()}>
            <RouterProvider router={router} />
        </SiteProviders>,
    );
    await vi.waitFor(() => {
        if (!container.querySelector("main h1")) throw new Error(`No h1 yet at ${path}`);
    }, { timeout : 30_000, interval : 50 });
    await vi.waitFor(() => {
        const busy = container.querySelector("[aria-busy='true']");
        if (busy) throw new Error(`Still loading at ${path}: ${busy.textContent ?? ""}`);
    }, { timeout : 30_000, interval : 50 });
}

describe("site routes", () => {
    it.each([...APP_PATHS, ...CONTENT_PATHS])("renders %s without errors", async (path) => {
        await renderPath(path);
        expect(container.querySelector("header nav[aria-label='Main']")).not.toBeNull();
        expect(container.querySelector("main h1")?.textContent?.trim()).not.toBe("");
        expect(problems).toEqual([]);
    });

    it("shows the reads of the default scenario in the context timeline", async () => {
        await renderPath("/explore/timeline");
        await vi.waitFor(() => {
            if (container.querySelectorAll("figure svg circle").length === 0) throw new Error("No dots yet");
        }, { timeout : 15_000 });
        const library = container.querySelector("section[aria-label='async-browser-context']");
        expect(library?.textContent).toMatch(/(^|\D)0 wrong/);
        expect(problems).toEqual([]);
    });

    it("runs a scenario in the context debugger and moves to the next step", async () => {
        await renderPath("/explore/debugger");
        await vi.waitFor(() => {
            if (container.querySelectorAll("svg[role='img'] text").length === 0) throw new Error("No frames yet");
        }, { timeout : 15_000 });
        container.querySelector<HTMLButtonElement>("button[aria-label='Next step']")?.click();
        await vi.waitFor(() => {
            if (!container.textContent?.includes("Step 2 of")) throw new Error("Not at step 2");
        });
        expect(problems).toEqual([]);
    });

    it("shows the output of the preset in the transform viewer", async () => {
        await renderPath("/explore/transform");
        expect(container.textContent).toContain("async-browser-context/runtime");
        expect(problems).toEqual([]);
    });

    it("gives the registration context to a click from the root context and C to a click from context C", async () => {
        await renderPath("/explore/events");
        const button = (text : string) : HTMLButtonElement => {
            const found = [...container.querySelectorAll("button")].find(candidate => candidate.textContent?.includes(text));
            if (!found) throw new Error(`No button "${text}"`);
            return found;
        };
        button("Add a listener in context A").click();
        button("Set onclick in context B").click();
        await vi.waitFor(() => {
            if (!button("Add a listener in context A").disabled) throw new Error("Not registered yet");
        });
        button("Dispatch a click from the root context").click();
        button("Dispatch a click from context C").click();
        await vi.waitFor(() => {
            if (container.querySelectorAll("li[data-status]").length < 4) throw new Error("Not four clicks yet");
        });
        const entries = [...container.querySelectorAll("li[data-status]")];
        expect(entries.every(entry => entry.getAttribute("data-status") === "correct")).toBe(true);
        expect(problems).toEqual([]);
    });
});
