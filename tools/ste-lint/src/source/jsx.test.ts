import { describe, expect, it } from "vitest";
import { extractJsxText } from "./jsx.js";

function blocksOf(source : string) {
    return extractJsxText(source, "page.tsx").blocks.map(({ block }) => ({
        kind : block.kind,
        text : block.lines.map(line => line.text).join("|"),
        offset : block.lines[0]!.offset,
    }));
}

describe("extractJsxText", () => {
    it("gives the text of an element as one block, with inline elements and expressions in it", () => {
        const source = "const a = <p>There are no results. Use <code>pnpm results</code> for {count} runs.</p>;";
        expect(blocksOf(source)).toEqual([{
            kind : "paragraph",
            text : "There are no results. Use |`x`| for |{x}| runs.",
            offset : source.indexOf("There"),
        }]);
    });

    it("gives headings and labels their own kinds", () => {
        const source = "const a = <div><h2>The results</h2><button>Start the run</button></div>;";
        expect(blocksOf(source).map(b => [b.kind, b.text])).toEqual([["heading", "The results"], ["table-cell", "Start the run"]]);
    });

    it("divides the text at block elements, and finds the JSX inside expressions", () => {
        const source = "const a = <section>First text.<ul>{items.map(i => <li key={i}>Item text.</li>)}</ul>Last text.</section>;";
        expect(blocksOf(source).map(b => b.text)).toEqual(["First text.", "Item text.", "Last text."]);
    });

    it("gives the text attributes, and ignores the other attributes", () => {
        const source = 'const a = <PlotFigure title="The drift chart" className="wide" description={"x"} aria-label="Drift" />;';
        expect(blocksOf(source).map(b => b.text)).toEqual(["The drift chart", "Drift"]);
    });

    it("ignores elements without words", () => {
        expect(blocksOf("const a = <p>{value} {unit}</p>;")).toEqual([]);
        expect(blocksOf("const a = <p>   </p>;")).toEqual([]);
    });

    it("keeps the text of inline elements in the paragraph", () => {
        const source = "const a = <p>Read the <Link to=\"/docs\">documentation</Link> first.</p>;";
        expect(blocksOf(source).map(b => b.text)).toEqual(["Read the |documentation| first."]);
    });
});
