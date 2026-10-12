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
import { mountApp } from "./prerender-handoff";
import { createAppRoutes } from "./routes";
import { documentEntryKey, scrollKey, scrollWhenShown } from "./scroll";
import { siteSections } from "./sections";
import { SiteProviders, type SiteServices } from "./SiteProviders";

const DATA = { probes, mutation, browsers, bench } as unknown as SiteDataMap;

function services() : SiteServices {
    return {
        sections : siteSections,
        content : siteContent,
        data : createMemoryDataSource(DATA),
        preferences : createMemoryPreferenceStore(),
    };
}

const added : HTMLElement[] = [];
let root : Root | undefined;

beforeEach(() => {
    window.scrollTo(0, 0);
});

afterEach(() => {
    root?.unmount();
    root = undefined;
    for (const element of added.splice(0)) element.remove();
    window.scrollTo(0, 0);
});

function element<K extends keyof HTMLElementTagNameMap>(tag : K) : HTMLElementTagNameMap[K] {
    const made = document.createElement(tag);
    document.body.append(made);
    added.push(made);
    return made;
}

async function waitForHeading(container : HTMLElement) : Promise<void> {
    await vi.waitFor(() => {
        if (!container.querySelector("main h1")) throw new Error("No h1 yet");
    }, { timeout : 30_000, interval : 50 });
}

describe("scroll keys", () => {
    it("gives the history entry of the document load a key of its own, in place of \"default\"", () => {
        const key = documentEntryKey();
        expect(key).toMatch(/^entry-/);
        expect((history.state as Record<string, unknown>)["abcEntry"]).toBe(key);
        expect(scrollKey({ pathname : "/", search : "", hash : "", state : null, key : "default" })).toBe(key);
        expect(scrollKey({ pathname : "/", search : "", hash : "", state : null, key : "x1" })).toBe("x1");
    });
});

describe("scrollWhenShown", () => {
    it("scrolls to an element that shows later", async () => {
        const page = element("div");
        page.style.height = "4000px";
        const stop = scrollWhenShown("late-target");
        const target = document.createElement("h2");
        target.id = "late-target";
        target.textContent = "Late";
        page.append(target);
        page.style.paddingTop = "2000px";
        await vi.waitFor(() => expect(window.scrollY).toBeGreaterThan(1000));
        stop();
    });

    it("stops when the reader scrolls", async () => {
        const page = element("div");
        page.style.height = "4000px";
        scrollWhenShown("other-target");
        window.dispatchEvent(new WheelEvent("wheel"));
        const target = document.createElement("h2");
        target.id = "other-target";
        page.style.paddingTop = "2000px";
        page.append(target);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(window.scrollY).toBe(0);
    });
});

describe("the scroll of the site", () => {
    it("scrolls to the heading of a link to page#heading after the lazy page loads", async () => {
        const container = element("div");
        const router = createMemoryRouter(createAppRoutes(siteSections), { initialEntries : ["/"] });
        root = createRoot(container);
        root.render(<SiteProviders services={services()}><RouterProvider router={router} /></SiteProviders>);
        await waitForHeading(container);
        await router.navigate("/docs/api#addcallbackhook");
        await vi.waitFor(() => {
            const heading = document.getElementById("addcallbackhook");
            if (!heading) throw new Error("No heading yet");
            const top = heading.getBoundingClientRect().top;
            if (top < 0 || top > 200) throw new Error(`The heading is at ${top}px`);
        }, { timeout : 30_000, interval : 50 });
    });

    it("does not scroll the page from the hidden app before the swap", async () => {
        const saved = element("div");
        saved.setAttribute("data-prerendered", "");
        saved.style.height = "5000px";
        saved.innerHTML = "<main><h1>Saved page</h1></main>";
        window.scrollTo(0, 600);
        expect(window.scrollY).toBe(600);
        const mount = mountApp(saved, "", { quietMs : 20_000, settleMs : 20_000, timeoutMs : 30_000 });
        added.push(mount.element);
        const router = createMemoryRouter(createAppRoutes(siteSections), { initialEntries : ["/"] });
        root = createRoot(mount.element, mount.options);
        root.render(<SiteProviders services={services()}><RouterProvider router={router} /></SiteProviders>);
        await waitForHeading(mount.element);
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(saved.isConnected).toBe(true);
        expect(window.scrollY).toBe(600);
    });
});
