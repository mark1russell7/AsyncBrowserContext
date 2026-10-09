import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { search, type SearchEntry, type SearchResult } from "./match";
import styles from "./Search.module.css";

let index : Promise<SearchEntry[]> | undefined;

/** The page loads the index when the reader opens the search the first time, or points to the button. */
function loadIndex() : Promise<SearchEntry[]> {
    index ??= import("virtual:search-index").then(module => module.default);
    return index;
}

/** A page loads its content after the navigation. This function waits for the heading, and then shows it. */
function scrollToHeading(id : string) : void {
    const started = performance.now();
    const step = () => {
        const element = document.getElementById(id);
        if (element) element.scrollIntoView({ block : "start" });
        else if (performance.now() - started < 3000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function SearchIcon() {
    return (
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12.6 12.6 17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function SearchDialog({ onClose } : { onClose() : void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [entries, setEntries] = useState<SearchEntry[]>();
    const [failed, setFailed] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const navigate = useNavigate();
    const listId = useId();

    useEffect(() => {
        dialog.current?.showModal();
        loadIndex().then(setEntries, () => setFailed(true));
    }, []);

    const results = useMemo(() => (entries === undefined ? [] : search(entries, query)), [entries, query]);
    useEffect(() => setActive(0), [query]);

    const open = (result : SearchResult) => {
        dialog.current?.close();
        const hash = result.heading ? `#${result.heading.id}` : "";
        void navigate(`/${result.entry.path}${hash}`);
        if (result.heading) scrollToHeading(result.heading.id);
    };

    const onKeyDown = (event : KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (results.length === 0) return;
            const offset = event.key === "ArrowDown" ? 1 : -1;
            setActive(value => (value + offset + results.length) % results.length);
        } else if (event.key === "Enter") {
            const result = results[active];
            if (result) {
                event.preventDefault();
                open(result);
            }
        }
    };

    const optionId = (position : number) : string => `${listId}-option-${position}`;
    let status : string | undefined;
    if (failed) status = "The search index did not load.";
    else if (entries === undefined) status = "The search index loads.";
    else if (query.trim() === "") status = "Write a word, for example \"generator\" or \"React\".";
    else if (results.length === 0) status = "No page contains all the words.";

    return (
        <dialog
            ref={dialog}
            className={styles.dialog}
            aria-label="Search the documentation"
            onClose={onClose}
            onClick={(event) => {
                if (event.target === dialog.current) dialog.current?.close();
            }}
        >
            <div className={styles.panel}>
                <div className={styles.field}>
                    <SearchIcon />
                    <input
                        autoFocus
                        type="search"
                        role="combobox"
                        aria-expanded={results.length > 0}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
                        placeholder="Search the documentation"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                    />
                    <kbd>Esc</kbd>
                </div>
                {status === undefined ? null : <p className={styles.status} role="status">{status}</p>}
                <ul id={listId} role="listbox" aria-label="Results" className={styles.results}>
                    {results.map((result, position) => (
                        <li
                            key={`${result.entry.path}-${result.heading?.id ?? ""}`}
                            id={optionId(position)}
                            role="option"
                            aria-selected={position === active}
                            onPointerMove={() => setActive(position)}
                            onClick={() => open(result)}
                        >
                            <span className={styles.resultPath}>
                                {result.entry.section}
                                {result.heading ? ` › ${result.entry.title}` : ""}
                            </span>
                            <span className={styles.resultTitle}>{result.heading ? result.heading.text : result.entry.title}</span>
                            {result.snippet ? (
                                <span className={styles.snippet}>
                                    {result.snippet.before}<mark>{result.snippet.match}</mark>{result.snippet.after}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
                <p className={styles.footer} aria-hidden="true">
                    <kbd>↑</kbd> <kbd>↓</kbd> select · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
                </p>
            </div>
        </dialog>
    );
}

/** The search button of the header. Ctrl+K, Cmd+K or the "/" key also opens the search. */
export function SearchButton() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const onKey = (event : globalThis.KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = target !== null && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
            if ((event.key === "k" || event.key === "K") && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                setOpen(true);
            } else if (event.key === "/" && !typing) {
                event.preventDefault();
                setOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    return (
        <>
            <button
                type="button"
                className={styles.button}
                aria-keyshortcuts="Control+K Meta+K /"
                onClick={() => setOpen(true)}
                onPointerEnter={() => void loadIndex().catch(() => undefined)}
            >
                <SearchIcon />
                <span className={styles.label}>Search</span>
                <kbd className={styles.shortcut}>Ctrl K</kbd>
            </button>
            {open ? <SearchDialog onClose={() => setOpen(false)} /> : null}
        </>
    );
}
