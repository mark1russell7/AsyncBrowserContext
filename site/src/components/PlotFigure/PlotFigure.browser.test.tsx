import "../../styles/global.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlotFigure } from "./PlotFigure";

let container : HTMLDivElement;
let root : Root;

beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "500px";
    document.body.append(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
});

const POINTS = [{ x : 1, y : 1, label : "A" }, { x : 2, y : 2, label : "B" }];

/** A chart with a dot and a red letter on each point. The options function is new at each render, as in the pages. */
function Chart({ points, render } : { points : typeof POINTS; render : number }) {
    return (
        <div data-render={render}>
            <PlotFigure
                title="Points"
                options={({ Plot }) => ({
                    marks : [
                        Plot.dot(points, { x : "x", y : "y", r : 10, fill : "#2a78d6" }),
                        Plot.text(points, { x : "x", y : "y", text : "label", fill : "#ff0000" }),
                    ],
                })}
            />
        </div>
    );
}

async function waitForChart() : Promise<SVGSVGElement> {
    let svg : SVGSVGElement | null = null;
    await vi.waitFor(() => {
        svg = container.querySelector("svg");
        if (!svg) throw new Error("No chart yet");
    }, { timeout : 15_000 });
    return svg!;
}

describe("PlotFigure", () => {
    it("keeps the fill of a text mark", async () => {
        flushSync(() => root.render(<Chart points={POINTS} render={0} />));
        const svg = await waitForChart();
        const letter = [...svg.querySelectorAll("text")].find(text => text.textContent === "A");
        expect(letter && getComputedStyle(letter).fill).toBe("rgb(255, 0, 0)");
    });

    it("keeps the chart when the parent renders again with the same data, and makes it again for new data", async () => {
        flushSync(() => root.render(<Chart points={POINTS} render={0} />));
        const first = await waitForChart();
        flushSync(() => root.render(<Chart points={POINTS} render={1} />));
        expect(container.querySelector("svg")).toBe(first);
        flushSync(() => root.render(<Chart points={[...POINTS, { x : 3, y : 3, label : "C" }]} render={2} />));
        expect(container.querySelector("svg")).not.toBe(first);
        expect(container.querySelectorAll("circle")).toHaveLength(3);
    });
});

describe("the prose styles", () => {
    it("give paragraphs and lists of the text a bottom margin, and leave the margins of a component class", () => {
        const prose = document.createElement("div");
        prose.className = "prose";
        prose.innerHTML = "<p>One</p><ul><li>A</li><li>B</li></ul><ul style=\"margin: 0\" class=\"widget\"><li>C</li><li>D</li></ul>";
        container.append(prose);
        const [paragraph] = prose.querySelectorAll("p");
        const [text, widget] = prose.querySelectorAll("ul");
        expect(getComputedStyle(paragraph!).marginBottom).toBe("16px");
        expect(getComputedStyle(paragraph!).marginTop).toBe("0px");
        expect(getComputedStyle(text!).marginBottom).toBe("16px");
        expect(getComputedStyle(text!.children[1]!).marginTop).toBe("4px");
        expect(getComputedStyle(widget!.children[1]!).marginTop).toBe("0px");
    });
});
