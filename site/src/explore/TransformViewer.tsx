import examples from "virtual:transform-examples";
import { useState } from "react";
import { HighlightedCode } from "../components/Code/HighlightedCode";
import styles from "./Explore.module.css";

export type TransformViewerProps = {
    /** The ID of the first example. */
    example? : string;
};

/**
 * The transform viewer. It shows the input and the output of the Babel preset
 * of the library for each example. The build of the site makes the output with
 * the real preset (refer to `build/transform-examples.ts`).
 */
export function TransformViewer({ example : initialExample } : TransformViewerProps) {
    const [selectedId, setSelectedId] = useState(initialExample ?? examples[0]?.id ?? "");
    const selected = examples.find(example => example.id === selectedId) ?? examples[0];
    if (!selected) return <p className={styles.error}>The build of the site did not make the examples.</p>;
    return (
        <div className={styles.widget}>
            <ul className={styles.choices} aria-label="Example">
                {examples.map(example => (
                    <li key={example.id}>
                        <button type="button" className={styles.choice} aria-pressed={example.id === selected.id} onClick={() => setSelectedId(example.id)}>
                            {example.title}
                        </button>
                    </li>
                ))}
            </ul>
            <p className={styles.summary}>{selected.note}</p>
            <div className={styles.panels}>
                <div className={styles.split}>
                    <div>
                        <p className={styles.label}>Input</p>
                        <HighlightedCode lines={selected.inputLines} label="The input of the preset" />
                    </div>
                    <div>
                        <p className={styles.label}>Output of the preset</p>
                        <HighlightedCode lines={selected.outputLines} label="The output of the preset" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TransformViewer;
