import path from "node:path";
import type { Plugin } from "vite";
import type { Reporter, TestRunEndReason, TestSpecification, Vitest } from "vitest/node";

/** The parts of a test specification that the check reads. A `TestSpecification` of Vitest has these parts. */
export interface PlannedFile {
    readonly moduleId : string;
    readonly project : { readonly name : string };
    readonly testModule : { state() : string } | undefined;
}

/** A test file that the run planned, but that has no finished result. */
export interface LostFile {
    readonly project : string;
    readonly file : string;
    /** The state of the test module, or "no result" if Vitest has no test module for the file. */
    readonly state : string;
}

/** The states of a test module that finished. */
const FINISHED : ReadonlySet<string> = new Set(["passed", "failed", "skipped"]);

/**
 * The mark of the reporter. Vitest evaluates the configuration file more than
 * one time. Each evaluation has its own reporter class, thus `instanceof`
 * does not find a reporter of another evaluation.
 */
const MARK : unique symbol = Symbol.for("async-browser-context:lost-files-check");

/**
 * This function gives the planned test files that have no finished result.
 * Vitest does not fail a run for these files: the summary only shows fewer
 * files and tests (docs/testing.md, "The check for lost test files").
 */
export function findLostFiles(planned : readonly PlannedFile[]) : LostFile[] {
    const lost : LostFile[] = [];
    for (const specification of planned) {
        const state = specification.testModule?.state() ?? "no result";
        if (!FINISHED.has(state)) {
            lost.push({ project : specification.project.name, file : specification.moduleId, state });
        }
    }
    return lost;
}

/** This function gives the message of the check: one line for each lost file. */
export function describeLostFiles(lost : readonly LostFile[], root : string) : string {
    const lines = lost.map((file) => `  |${file.project}| ${path.relative(root, file.file).replaceAll("\\", "/")} (${file.state})`);
    return [
        `Lost test files: ${lost.length} test file${lost.length === 1 ? "" : "s"} of this run did not give a finished result.`,
        ...lines,
        "Vitest did not show a failure for these files. The check of test/vitest/lost-files.ts fails the run.",
    ].join("\n");
}

/** The default action of the check: show the message and set a non-zero exit code. */
function failRun(message : string, vitest : Vitest | undefined) : void {
    process.exitCode = 1;
    if (vitest === undefined) {
        process.stderr.write(`${message}\n`);
    } else {
        vitest.logger.error(message);
    }
}

/**
 * A reporter that fails a run when a planned test file has no finished result.
 * It compares the specifications of the current run with the test modules. A
 * run that stopped early (`--bail`, a cancel, a new run in watch mode) is not
 * examined, because the files that did not start are not lost. A run with
 * `--shard` is not examined either: Vitest plans all files, but starts only a part.
 */
export class LostFilesReporter implements Reporter {
    readonly [MARK] = true;
    readonly #fail : (message : string, vitest : Vitest | undefined) => void;
    #vitest : Vitest | undefined;
    #planned : readonly PlannedFile[] = [];

    constructor(fail : (message : string, vitest : Vitest | undefined) => void = failRun) {
        this.#fail = fail;
    }

    onInit(vitest : Vitest) : void {
        this.#vitest = vitest;
    }

    onTestRunStart(specifications : ReadonlyArray<TestSpecification>) : void {
        this.#planned = specifications;
    }

    onTestRunEnd(_modules : unknown, _errors : unknown, reason : TestRunEndReason) : void {
        const planned = this.#planned;
        this.#planned = [];
        if (reason === "interrupted" || this.#vitest?.config.shard) {
            return;
        }
        const lost = findLostFiles(planned);
        if (lost.length > 0) {
            this.#fail(describeLostFiles(lost, this.#vitest?.config.root ?? process.cwd()), this.#vitest);
        }
    }
}

/**
 * A Vite plugin that adds the reporter to each run. The plugin adds it to the
 * resolved reporters, thus the check also operates when the command line
 * replaces the reporters (for example `--reporter=json`). Vitest uses the
 * hook one time for each project, but the run gets only one reporter.
 */
export function lostFilesCheck() : Plugin {
    return {
        name : "async-browser-context:lost-files-check",
        configureVitest({ vitest }) {
            const reporters = vitest.config.reporters;
            if (!reporters.some((reporter) => typeof reporter === "object" && reporter !== null && MARK in reporter)) {
                reporters.push(new LostFilesReporter());
            }
        },
    };
}
