import { ROOT, type ContextVariable } from "./implementations";

/**
 * The result of one read:
 * - "correct": the read got the expected context.
 * - "lost": the read got the root context (no value).
 * - "wrong": the read got the context of a different operation.
 */
export type ReadStatus = "correct" | "lost" | "wrong";

/** One read of the variable in a scenario. */
export type Read = {
    /** The position of the read in time: 1 is the first read. */
    order : number;
    /** The task that made the read, for example "A". */
    task : string;
    /** Where in the code the read is. */
    step : string;
    expected : string;
    seen : string;
    status : ReadStatus;
};

/** This function compares the context that a read got with the expected context. */
export function classify(expected : string, seen : string) : ReadStatus {
    if (seen === expected) return "correct";
    if (seen === ROOT) return "lost";
    return "wrong";
}

/** A function that reads the variable, records the read, and gives the value that it read. */
export type RecordRead = (task : string, step : string, expected : string) => string;

/** The reads of one scenario. */
export type Recorder = {
    readonly record : RecordRead;
    reads() : readonly Read[];
};

/** This function makes a recorder that reads `variable`. */
export function createRecorder(variable : ContextVariable) : Recorder {
    const reads : Read[] = [];
    return {
        record(task, step, expected) {
            const seen = variable.get();
            reads.push({ order : reads.length + 1, task, step, expected, seen, status : classify(expected, seen) });
            return seen;
        },
        reads : () => reads,
    };
}

/** The number of reads with each status. */
export type ReadSummary = Record<ReadStatus, number> & { total : number };

export function summarize(reads : readonly Read[]) : ReadSummary {
    const summary : ReadSummary = { total : reads.length, correct : 0, lost : 0, wrong : 0 };
    for (const read of reads) summary[read.status]++;
    return summary;
}
