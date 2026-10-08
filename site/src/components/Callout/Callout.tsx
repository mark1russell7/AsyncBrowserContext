import type { ReactNode } from "react";
import styles from "./Callout.module.css";

/**
 * The callout types follow the ASD-STE100 labels:
 * - `warning`: a risk of wrong measurements or lost data
 * - `caution`: a risk of damage to performance or to other parts of the system
 * - `note`: information that helps the reader
 */
export type CalloutType = "note" | "warning" | "caution";

const LABELS : Readonly<Record<CalloutType, string>> = {
    note : "Note",
    warning : "Warning",
    caution : "Caution",
};

function CalloutIcon({ type } : { type : CalloutType }) {
    // Each type has its own shape, so the type is clear without color.
    if (type === "warning") {
        return (
            <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 2.5 18.5 17h-17Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M10 7.5v4.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }
    if (type === "caution") {
        return (
            <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 1.8 18.2 10 10 18.2 1.8 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M10 6.5v4.5M10 13.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }
    return (
        <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 9v5M10 6v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export type CalloutProps = {
    type? : CalloutType;
    /** A short title after the label, for example "Hidden pages". */
    title? : string;
    children : ReactNode;
};

export function Callout({ type = "note", title, children } : CalloutProps) {
    return (
        <div className={styles.callout} data-type={type} role="note">
            <CalloutIcon type={type} />
            <div className={styles.body}>
                <p className={styles.label}>
                    <strong>{LABELS[type]}</strong>
                    {title ? <span className={styles.title}>{title}</span> : null}
                </p>
                <div className={styles.content}>{children}</div>
            </div>
        </div>
    );
}
