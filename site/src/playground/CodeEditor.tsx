import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import type { CodeToken } from "../components/Code/HighlightedCode";
import styles from "./Playground.module.css";

const INDENT = "    ";

export type CodeEditorProps = {
    value : string;
    onChange(value : string) : void;
    /** The function of the keys Ctrl+Enter (Cmd+Enter on macOS). */
    onRun() : void;
    lines : readonly (readonly CodeToken[])[];
    /** The line with an error, from 1. */
    errorLine? : number | undefined;
    label : string;
    describedBy? : string;
};

/**
 * A code editor: a text area without color on top of the highlighted code.
 * The Tab key indents. Press Escape and then Tab to move out of the editor.
 */
export function CodeEditor({ value, onChange, onRun, lines, errorLine, label, describedBy } : CodeEditorProps) {
    const area = useRef<HTMLTextAreaElement>(null);
    const layer = useRef<HTMLPreElement>(null);
    const gutter = useRef<HTMLDivElement>(null);
    const escaped = useRef(false);

    const sync = () => {
        const textarea = area.current;
        if (!textarea) return;
        if (layer.current) {
            layer.current.scrollTop = textarea.scrollTop;
            layer.current.scrollLeft = textarea.scrollLeft;
        }
        if (gutter.current) gutter.current.scrollTop = textarea.scrollTop;
    };

    const replace = (textarea : HTMLTextAreaElement, start : number, end : number, text : string, caret : number) => {
        const next = value.slice(0, start) + text + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => textarea.setSelectionRange(caret, caret));
    };

    const onKeyDown = (event : KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = event.currentTarget;
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            onRun();
            return;
        }
        if (event.key === "Escape") {
            escaped.current = true;
            return;
        }
        if (event.key === "Tab" && !escaped.current && !event.shiftKey) {
            event.preventDefault();
            const { selectionStart, selectionEnd } = textarea;
            replace(textarea, selectionStart, selectionEnd, INDENT, selectionStart + INDENT.length);
            return;
        }
        if (event.key === "Enter") {
            // A new line gets the indent of the line before it.
            event.preventDefault();
            const { selectionStart, selectionEnd } = textarea;
            const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
            const indent = /^[ \t]*/.exec(value.slice(lineStart, selectionStart))?.[0] ?? "";
            const extra = /[{([]\s*$/.test(value.slice(lineStart, selectionStart)) ? INDENT : "";
            const text = `\n${indent}${extra}`;
            replace(textarea, selectionStart, selectionEnd, text, selectionStart + text.length);
        }
        escaped.current = false;
    };

    const count = Math.max(lines.length, value.split("\n").length);
    return (
        <div className={styles.editor}>
            <div ref={gutter} className={styles.editorGutter} aria-hidden="true">
                {Array.from({ length : count }, (_, index) => (
                    <span key={index} data-error={errorLine === index + 1 ? "true" : undefined}>{index + 1}</span>
                ))}
            </div>
            <div className={styles.editorStack}>
                <pre ref={layer} className={styles.editorLayer} aria-hidden="true">
                    <code>
                        {lines.map((tokens, index) => (
                            <span key={index} className={styles.editorLine} data-error={errorLine === index + 1 ? "true" : undefined}>
                                {tokens.map(([text, light, dark, italic], key) => (
                                    <span key={key} className={styles.token} data-italic={italic === 1 ? "true" : undefined} style={{ "--l" : light, "--d" : dark } as CSSProperties}>{text}</span>
                                ))}
                                {"\n"}
                            </span>
                        ))}
                    </code>
                </pre>
                <textarea
                    ref={area}
                    className={styles.editorInput}
                    value={value}
                    rows={Math.max(12, count + 1)}
                    wrap="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    aria-label={label}
                    aria-describedby={describedBy}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    onScroll={sync}
                />
            </div>
        </div>
    );
}
