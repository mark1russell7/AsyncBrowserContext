import { ScrollTable } from "../ScrollTable/ScrollTable";
import styles from "./DataTable.module.css";

export type DataTableColumn = {
    key : string;
    label : string;
    /** Numbers align right. */
    align? : "left" | "right";
    format? : (value : unknown) => string;
};

/** A table that gives the same data as a chart, for readers who cannot see the chart. */
export type DataTableSpec = {
    caption? : string;
    columns : readonly DataTableColumn[];
    rows : ReadonlyArray<Readonly<Record<string, unknown>>>;
};

function cellText(value : unknown, column : DataTableColumn) : string {
    if (column.format) return column.format(value);
    if (value === undefined || value === null) return "–";
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

export function DataTable({ spec, label } : { spec : DataTableSpec; label : string }) {
    return (
        <ScrollTable label={label}>
            <table className={styles.table}>
                {spec.caption ? <caption>{spec.caption}</caption> : null}
                <thead>
                    <tr>
                        {spec.columns.map(column => (
                            <th key={column.key} scope="col" data-align={column.align ?? "left"}>{column.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {spec.rows.map((row, index) => (
                        <tr key={index}>
                            {spec.columns.map(column => (
                                <td key={column.key} data-align={column.align ?? "left"}>{cellText(row[column.key], column)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </ScrollTable>
    );
}

/** A data table behind a disclosure, under a chart. */
export function DataTableDisclosure({ spec, title } : { spec : DataTableSpec; title : string }) {
    return (
        <details className={styles.disclosure}>
            <summary>Show the data as a table</summary>
            <DataTable spec={spec} label={`Data: ${title}`} />
        </details>
    );
}
