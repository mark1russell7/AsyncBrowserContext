import {
    Children,
    isValidElement,
    useId,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactElement,
    type ReactNode,
} from "react";
import styles from "./Tabs.module.css";

export type TabProps = {
    label : string;
    children : ReactNode;
};

/** One panel of a `Tabs` set. `Tabs` shows it. Alone, it shows nothing. */
export function Tab({ children } : TabProps) {
    return <>{children}</>;
}

function isTab(node : ReactNode) : node is ReactElement<TabProps> {
    return isValidElement<TabProps>(node) && typeof node.props.label === "string";
}

export type TabsProps = {
    /** The accessible name of the tab list, for example "Package manager". */
    label? : string;
    children : ReactNode;
};

/**
 * Tabs that obey the WAI-ARIA tabs pattern. The arrow keys move between the
 * tabs. Home and End go to the first and the last tab.
 */
export function Tabs({ label, children } : TabsProps) {
    const tabs = Children.toArray(children).filter(isTab);
    const [selected, setSelected] = useState(0);
    const baseId = useId();
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    const active = Math.min(selected, Math.max(0, tabs.length - 1));

    const select = (index : number, focus : boolean) : void => {
        setSelected(index);
        if (focus) buttons.current[index]?.focus();
    };

    const onKeyDown = (event : KeyboardEvent<HTMLDivElement>) : void => {
        const last = tabs.length - 1;
        let next : number | undefined;
        if (event.key === "ArrowRight") next = active === last ? 0 : active + 1;
        else if (event.key === "ArrowLeft") next = active === 0 ? last : active - 1;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = last;
        if (next === undefined) return;
        event.preventDefault();
        select(next, true);
    };

    return (
        <div className={styles.tabs}>
            <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
                {tabs.map((tab, index) => (
                    <button
                        key={tab.props.label}
                        ref={(element) => { buttons.current[index] = element; }}
                        type="button"
                        role="tab"
                        id={`${baseId}-tab-${index}`}
                        aria-selected={index === active}
                        aria-controls={`${baseId}-panel-${index}`}
                        tabIndex={index === active ? 0 : -1}
                        className={styles.tab}
                        onClick={() => select(index, false)}
                    >
                        {tab.props.label}
                    </button>
                ))}
            </div>
            {tabs.map((tab, index) => (
                <div
                    key={tab.props.label}
                    role="tabpanel"
                    id={`${baseId}-panel-${index}`}
                    aria-labelledby={`${baseId}-tab-${index}`}
                    hidden={index !== active}
                    tabIndex={0}
                    className={styles.panel}
                >
                    {tab.props.children}
                </div>
            ))}
        </div>
    );
}
