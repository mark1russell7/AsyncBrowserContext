import styles from "./StatusIcon.module.css";

/**
 * The states that the results viewer shows. Each state has its own shape and
 * its own label, so the state is clear without color.
 */
export type StatusKind = "passed" | "failed" | "skipped" | "todo" | "pass" | "fail" | "none";

const LABELS : Readonly<Record<StatusKind, string>> = {
    passed : "Passed",
    failed : "Failed",
    skipped : "Skipped",
    todo : "To do",
    pass : "Pass",
    fail : "Fail",
    none : "No tests",
};

export function statusLabel(kind : StatusKind) : string {
    return LABELS[kind];
}

function Shape({ kind } : { kind : StatusKind }) {
    switch (kind) {
        case "passed":
        case "pass":
            return <path d="M5 10.5 8.5 14 15 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />;
        case "failed":
        case "fail":
            return <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />;
        case "skipped":
            return <path d="M5.5 10h9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />;
        case "todo":
            return <circle cx="10" cy="10" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2.4 2.2" />;
        case "none":
            return <circle cx="10" cy="10" r="1.6" fill="currentColor" />;
    }
}

export type StatusIconProps = {
    kind : StatusKind;
    /** Show the label next to the icon. Without it, the label is the accessible name of the icon. */
    showLabel? : boolean;
    /** Text after the label, for example a count. */
    detail? : string;
};

export function StatusIcon({ kind, showLabel = true, detail } : StatusIconProps) {
    const label = statusLabel(kind);
    return (
        <span className={styles.status} data-kind={kind}>
            <svg className={styles.icon} viewBox="0 0 20 20" role={showLabel ? undefined : "img"}
                aria-hidden={showLabel ? true : undefined} aria-label={showLabel ? undefined : label} focusable="false">
                <Shape kind={kind} />
            </svg>
            {showLabel ? <span>{label}{detail ? ` ${detail}` : ""}</span> : null}
        </span>
    );
}
