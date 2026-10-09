import "../styles/global.css";
import { useId } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HANDOFF_ID_PREFIX, mountApp, routePathOf } from "./prerender-handoff";

const added : HTMLElement[] = [];

/** A root element with HTML from the build for the route `path`. */
function prerenderedRoot(path : string) : HTMLElement {
    const root = document.createElement("div");
    root.id = "test-root";
    root.setAttribute("data-prerendered", path);
    root.innerHTML = `<main><h1>Saved page</h1></main>`;
    document.body.prepend(root);
    added.push(root);
    return root;
}

afterEach(() => {
    for (const element of added.splice(0)) element.remove();
    document.querySelectorAll("#test-root").forEach(element => element.remove());
});

describe("routePathOf", () => {
    it("gives the route of a URL path below the base", () => {
        expect(routePathOf("/AsyncBrowserContext/", "/AsyncBrowserContext/")).toBe("");
        expect(routePathOf("/AsyncBrowserContext", "/AsyncBrowserContext/")).toBe("");
        expect(routePathOf("/AsyncBrowserContext/docs/api/", "/AsyncBrowserContext/")).toBe("docs/api");
        expect(routePathOf("/docs/concepts/rules", "/")).toBe("docs/concepts/rules");
        expect(routePathOf("/Repo/docs/caf%C3%A9", "https://cdn.example.com/Repo/")).toBe("docs/café");
        expect(routePathOf("/AsyncBrowserContextOther/docs", "/AsyncBrowserContext/")).toBe("AsyncBrowserContextOther/docs");
    });
});

describe("mountApp", () => {
    it("gives the root element when the page has no HTML from the build", () => {
        const root = document.createElement("div");
        expect(mountApp(root, "")).toEqual({ element : root, options : {} });
    });

    it("removes HTML from the build for a different route", () => {
        const root = prerenderedRoot("");
        const mount = mountApp(root, "no/such/page");
        expect(mount.element).toBe(root);
        expect(root.childElementCount).toBe(0);
        expect(root.hasAttribute("data-prerendered")).toBe(false);
    });

    it("renders hidden over the saved HTML, and shows the app when nothing loads", async () => {
        const root = prerenderedRoot("docs/api");
        const mount = mountApp(root, "docs/api", { quietMs : 20, settleMs : 200, timeoutMs : 5000 });
        const live = mount.element;
        added.push(live);
        expect(live).not.toBe(root);
        expect(live.previousElementSibling).toBe(root);
        expect(live.inert).toBe(true);
        expect(getComputedStyle(live).opacity).toBe("0");
        expect(getComputedStyle(live).visibility).toBe("hidden");
        expect(live.getBoundingClientRect().height).toBe(0);
        expect(Math.round(live.getBoundingClientRect().width)).toBe(Math.round(root.getBoundingClientRect().width));
        expect(mount.options.identifierPrefix).toBe(HANDOFF_ID_PREFIX);

        live.innerHTML = `<main><p data-loading="">The page loads.</p></main>`;
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(root.isConnected).toBe(true);
        expect(live.inert).toBe(true);

        live.innerHTML = `<main><h1>Saved page</h1></main>`;
        await vi.waitFor(() => expect(root.isConnected).toBe(false));
        expect(live.id).toBe("test-root");
        expect(live.getAttribute("style")).toBeNull();
        expect(live.inert).toBe(false);
    });

    it("shows the app after the time limit, also when an element still loads", async () => {
        const root = prerenderedRoot("");
        const live = mountApp(root, "", { quietMs : 20, settleMs : 100, timeoutMs : 200 }).element;
        added.push(live);
        live.innerHTML = `<p data-loading="">The data loads.</p>`;
        await vi.waitFor(() => expect(root.isConnected).toBe(false), { timeout : 2000 });
        expect(live.inert).toBe(false);
    });

    it("gives React an ID prefix, so the IDs differ from the IDs in the saved HTML", () => {
        const root = prerenderedRoot("");
        const mount = mountApp(root, "");
        added.push(mount.element);
        function Labeled() {
            return <p id={useId()}>Text</p>;
        }
        const reactRoot = createRoot(mount.element, mount.options);
        flushSync(() => reactRoot.render(<Labeled />));
        expect(mount.element.querySelector("p")?.id).toContain(HANDOFF_ID_PREFIX);
        reactRoot.unmount();
    });
});
