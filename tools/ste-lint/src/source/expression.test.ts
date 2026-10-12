import { describe, expect, it } from "vitest";
import { expressionEnd, tagEnd } from "./expression.js";

/** The text of the expression that starts at the first `{`, or null. */
function expression(text : string) : string | null {
    const open = text.indexOf("{");
    const close = expressionEnd(text, open);
    return close === -1 ? null : text.slice(open, close + 1);
}

describe("expressionEnd", () => {
    it("finds the closing brace of nested braces", () => {
        expect(expression("{a({ b : [c] })} rest")).toBe("{a({ b : [c] })}");
    });

    it("skips strings, template literals and comments", () => {
        expect(expression("{f('}', \"{\")} rest")).toBe("{f('}', \"{\")}");
        expect(expression("{`a ${b ? \"}\" : `{`} c`} rest")).toBe("{`a ${b ? \"}\" : `{`} c`}");
        expect(expression("{/* it's } */} rest")).toBe("{/* it's } */}");
        expect(expression("{a // it's }\n} rest")).toBe("{a // it's }\n}");
    });

    it("does not read quotes and braces in JSX text as code", () => {
        expect(expression("{show && <p>Don't {name}</p>} rest")).toBe("{show && <p>Don't {name}</p>}");
        expect(expression("{list.map((item) => <li key={item}>It's \"x\"</li>)} rest")).toBe("{list.map((item) => <li key={item}>It's \"x\"</li>)}");
        expect(expression("{a ? <><b>x</b>'s</> : <br/>} rest")).toBe("{a ? <><b>x</b>'s</> : <br/>}");
        expect(expression("{(() => { return <i>it's</i>; })()} rest")).toBe("{(() => { return <i>it's</i>; })()}");
    });

    it("reads a < after a name as a comparison, not as JSX", () => {
        expect(expression("{a <b} rest")).toBe("{a <b}");
    });

    it("ends a string at the end of its line", () => {
        expect(expression("{a ? 'x : b\n} rest")).toBe("{a ? 'x : b\n}");
    });

    it("gives -1 when the expression does not close", () => {
        expect(expression("{open(")).toBeNull();
        expect(expression("{/* open")).toBeNull();
        expect(expression("{a // open")).toBeNull();
        expect(expressionEnd("{a}", 0, 2)).toBe(-1);
    });
});

describe("tagEnd", () => {
    it("finds the end of a tag with attribute strings and expressions", () => {
        const text = "<Chart title=\"a > b\" data={/* it's */ [1]} label='x' /> rest";
        expect(text.slice(0, tagEnd(text, 0))).toBe("<Chart title=\"a > b\" data={/* it's */ [1]} label='x' />");
        expect(tagEnd("</Note> rest", 0)).toBe(7);
        expect(tagEnd("<>text", 0)).toBe(2);
    });

    it("gives -1 when the tag does not close", () => {
        expect(tagEnd("<Open\n  attr", 0)).toBe(-1);
        expect(tagEnd("<Open title=\"x", 0)).toBe(-1);
    });
});
