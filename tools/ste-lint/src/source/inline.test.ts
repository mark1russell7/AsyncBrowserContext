import { describe, expect, it } from "vitest";
import { normalizeInline, PLACEHOLDER, type InlineOptions } from "./inline.js";
import { splitLines } from "./lines.js";

const markdown : InlineOptions = { mdx : false, tsdoc : false };

/** The clean text, with each placeholder shown as `[kind:text]`. */
function clean(text : string, options : InlineOptions = markdown) : string {
    const inline = normalizeInline(splitLines(text), options);
    let out = "";
    for (let i = 0; i < inline.clean.length; i++) {
        const placeholder = inline.placeholders.get(i);
        out += placeholder === undefined ? inline.clean[i] : `[${placeholder.kind}:${placeholder.text}]`;
    }
    return out;
}

describe("normalizeInline", () => {
    it("makes each code span one placeholder", () => {
        expect(clean("Use `pnpm -r build` and ``a ` b`` now.")).toBe("Use [code:pnpm -r build] and [code:a ` b] now.");
    });

    it("keeps backticks without a partner", () => {
        expect(clean("A ` alone")).toBe("A ` alone");
    });

    it("keeps link text, and removes the destination, images and footnote references", () => {
        expect(clean("Read [the `guide`](https://x.dev/a_(b) \"Title (x)\") now![^1] ![logo](logo.png)")).toBe("Read the [code:guide] now! ");
        expect(clean("See [the docs][docs] and [this][].")).toBe("See the docs and this.");
        expect(clean("A [bracket] alone.")).toBe("A [bracket] alone.");
    });

    it("makes URLs and autolinks one placeholder", () => {
        expect(clean("Go to https://example.com/a(b). Or <https://x.dev>.")).toBe("Go to [url:https://example.com/a(b)]. Or [url:https://x.dev].");
        expect(clean("Mail <me@example.com>, or www.example.com.")).toBe("Mail [url:me@example.com], or [url:www.example.com].");
        expect(clean("(https://example.com)")).toBe("([url:https://example.com])");
    });

    it("removes HTML tags and comments, and makes code elements placeholders", () => {
        expect(clean("Press <kbd>Ctrl</kbd> and <b>Save</b>.<br/>Next <!-- note --> line.")).toBe("Press [code:Ctrl] and Save. Next  line.");
        expect(clean("A <x-foo a=\"1 > 2\">tag</x-foo>.")).toBe("A tag.");
        expect(clean("Compare a < b and x<y.")).toBe("Compare a < b and x<y.");
    });

    it("removes emphasis markers but keeps snake_case and spaced asterisks", () => {
        expect(clean("**Bold** and *it* and _em_ and ~~old~~ and snake_case and 2 * 3.")).toBe("Bold and it and em and old and snake_case and 2 * 3.");
    });

    it("removes the backslash of an escape", () => {
        expect(clean("Not \\*emphasis\\* and a\\\\b.")).toBe("Not *emphasis* and a\\b.");
    });

    it("decodes HTML entities, and ignores names that are not entities", () => {
        expect(clean("A&nbsp;B &amp; C &#65; &#x42; &unknown; &constructor;")).toBe("A B & C A B &unknown; &constructor;");
    });

    it("makes quoted text one placeholder and keeps a final period outside it", () => {
        expect(clean("The word \"should\" is a modal. He said “Stop.” Then left.")).toBe("The word [quote:should] is a modal. He said [quote:Stop.]. Then left.");
        expect(clean("Use 'single quotes' here, but it's fine.")).toBe("Use [quote:single quotes] here, but it's fine.");
    });

    it("does not pair quotes that are apostrophes or inch marks", () => {
        expect(clean("The users' settings and a 5\" disk.")).toBe("The users' settings and a 5\" disk.");
        expect(clean("A \" lone quote.")).toBe("A \" lone quote.");
    });

    it("makes TSDoc inline tags one placeholder only in doc comments", () => {
        expect(clean("Refer to {@link Foo | the foo}.", { mdx : false, tsdoc : true })).toBe("Refer to [link:@link Foo | the foo].");
        expect(clean("A {literal} brace.")).toBe("A {literal} brace.");
    });

    it("makes MDX expressions placeholders and removes MDX comments", () => {
        expect(clean("Value {props.x} here {/* note */}.", { mdx : true, tsdoc : false })).toBe("Value [expr:props.x] here .");
        expect(clean("Open {brace", { mdx : true, tsdoc : false })).toBe("Open {brace");
    });

    it("keeps the file offset of each character", () => {
        const lines = splitLines("ab\n`c` d", 100);
        const inline = normalizeInline(lines, markdown);
        expect(inline.clean).toBe(`ab\n${PLACEHOLDER} d`);
        expect(inline.offsets).toEqual([100, 101, 102, 103, 106, 107]);
        expect(inline.placeholders.get(3)).toEqual({ kind : "code", text : "c", start : 103, end : 106 });
    });
});
