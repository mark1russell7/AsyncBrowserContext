import { useEffect, useState } from "react";
import styles from "./Home.module.css";

const COMMAND = "npm install async-browser-context";

/** The install command, with a button that copies it. */
export function InstallCommand() {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return undefined;
        const timer = window.setTimeout(() => setCopied(false), 1800);
        return () => window.clearTimeout(timer);
    }, [copied]);
    return (
        <div className={styles.install}>
            <span className={styles.prompt} aria-hidden="true">$</span>
            <code>{COMMAND}</code>
            <button
                type="button"
                className={styles.copy}
                onClick={() => {
                    navigator.clipboard?.writeText(COMMAND).then(() => setCopied(true), () => undefined);
                }}
            >
                {copied ? "Copied" : "Copy"}
            </button>
            <span className="visually-hidden" aria-live="polite">{copied ? "The command is on the clipboard." : ""}</span>
        </div>
    );
}
