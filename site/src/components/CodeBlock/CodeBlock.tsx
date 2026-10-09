import { useEffect, useRef, useState, type ComponentProps } from "react";
import styles from "./CodeBlock.module.css";

/** A code block of an MDX page, with a button that copies the code. */
export function CodeBlock(props : ComponentProps<"pre">) {
    const code = useRef<HTMLPreElement>(null);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return undefined;
        const timer = window.setTimeout(() => setCopied(false), 1600);
        return () => window.clearTimeout(timer);
    }, [copied]);
    return (
        <div className={styles.block}>
            <pre ref={code} {...props} />
            <button
                type="button"
                className={styles.copy}
                aria-label={copied ? "The code is on the clipboard" : "Copy the code"}
                onClick={() => {
                    navigator.clipboard?.writeText(code.current?.innerText ?? "").then(() => setCopied(true), () => undefined);
                }}
            >
                {copied ? "Copied" : "Copy"}
            </button>
        </div>
    );
}
