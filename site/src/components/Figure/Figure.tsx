import type { ReactNode } from "react";
import styles from "./Figure.module.css";

export type FigureProps = {
    /** The text that tells what the figure shows. Screen readers use it as the name of the figure. */
    caption : ReactNode;
    children : ReactNode;
};

export function Figure({ caption, children } : FigureProps) {
    return (
        <figure className={styles.figure}>
            <div className={styles.content}>{children}</div>
            <figcaption className={styles.caption}>{caption}</figcaption>
        </figure>
    );
}
