/**
 * The site mark: two frames, one in the other, and a value in the inner
 * frame. A context is a chain of frames, and a variable gets its value from
 * the nearest frame that sets it.
 */
export function BrandMark() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="none" stroke="var(--color-ink-muted)" strokeWidth="1.5" />
            <rect x="5.5" y="5.5" width="13" height="13" rx="3" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3.2" fill="var(--color-accent)" />
        </svg>
    );
}
