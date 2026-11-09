import { useRef, type CSSProperties } from "react";
import { useScrolls } from "../../lib/use-scrolls";
import styles from "./HighlightedCode.module.css";

/** One token of highlighted code: the text, the light color, the dark color, and `1` for italic text. The build makes the tokens with Shiki. */
export type CodeToken = readonly [text : string, light : string, dark : string, italic? : 1];
export type CodeLine = readonly CodeToken[];

export type HighlightedCodeProps = {
    lines : readonly CodeLine[];
    /** A text alternative for screen readers, for example "The input of the preset". */
    label? : string;
    className? : string;
};

/**
 * Code with the colors of the build. The light and the dark theme each have their colors.
 * A line that is wider than the box scrolls: the class scroll-cue shows a fade at the edge, and the box gets a tab stop.
 */
export function HighlightedCode({ lines, label, className } : HighlightedCodeProps) {
    const box = useRef<HTMLPreElement>(null);
    const scrolls = useScrolls(box, [lines]);
    return (
        <pre ref={box} className={`${styles.code} scroll-cue ${className ?? ""}`} tabIndex={scrolls ? 0 : undefined} role={label === undefined ? undefined : "group"} aria-label={label}>
            <code>
                {lines.map((line, index) => (
                    <span key={index}>
                        {line.map(([text, light, dark, italic], key) => (
                            <span key={key} className={styles.token} data-italic={italic === 1 ? "true" : undefined} style={{ "--l" : light, "--d" : dark } as CSSProperties}>{text}</span>
                        ))}
                        {index < lines.length - 1 ? "\n" : null}
                    </span>
                ))}
            </code>
        </pre>
    );
}
