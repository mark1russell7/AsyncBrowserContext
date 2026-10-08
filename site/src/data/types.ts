/**
 * The data files of the site, in `public/data/`. The test tools of the
 * repository write them. Each file has `sample : true` until a tool writes
 * real results, and then the pages show a note.
 */

/** The fields that each data file has. */
export type DataFileBase = {
    /** The time at which a tool wrote the file, in ISO 8601 format. */
    generated : string;
    /** `true` if the file contains sample values and not measured results. */
    sample? : boolean;
};

/** The result of a probe: a small program of the review that shows one problem. */
export type ProbeResult = {
    /** The ID of the probe, for example "P03b". */
    id : string;
    /** What the probe does. */
    scenario : string;
    /** The result with the old library (before the change). */
    before : string;
    /** The result with the new library. */
    after : string;
    /** The context rule that the probe examines, for example "C4". */
    rule? : string;
    /** "fixed": the new result is correct. "safe": the new result is the root context (rule C7). "documentation": the probe examines a text error. */
    status : "fixed" | "safe" | "documentation" | "correct";
};

export type ProbesFile = DataFileBase & {
    probes : ProbeResult[];
};

/** One row of the mutation table: the number of tests that pass with one mutant of the runtime. */
export type MutationRow = {
    /** The ID of the mutant, for example "m5". "real" is the runtime without a change. */
    mutant : string;
    /** What the mutant changes. */
    description : string;
    /** "old" is the old test suite. "new" is the current test suite. */
    suite : "old" | "new";
    passed : number;
    total : number;
};

/** The summary of a run of Stryker on the current tests. */
export type StrykerSummary = {
    /** The mutation score: the mutants that the tests found or that timed out, as a percentage of the mutants. */
    score : number;
    killed : number;
    survived : number;
    timeout : number;
    noCoverage : number;
    total : number;
    /** The source files that Stryker changed. */
    scope : string[];
};

export type MutationFile = DataFileBase & {
    rows : MutationRow[];
    stryker? : StrykerSummary;
};

/** The test results of one Vitest project in one browser. */
export type BrowserRow = {
    browser : "chromium" | "firefox" | "webkit" | string;
    version : string;
    passed : number;
    failed : number;
    skipped : number;
};

export type BrowsersFile = DataFileBase & {
    rows : BrowserRow[];
};

/** One benchmark: the mean durations of the same work in three cases. */
export type BenchRow = {
    benchmark : string;
    /** Plain JavaScript, without the library. */
    plainMs : number;
    /** The Babel preset with a plain coroutine, without the context. */
    transformOnlyMs : number;
    /** The Babel preset and the browser runtime of the library. */
    libraryMs : number;
};

export type BenchFile = DataFileBase & {
    environment : {
        node : string;
        os : string;
        cpu : string;
    };
    rows : BenchRow[];
};

/** The data file of each name. */
export type SiteDataMap = {
    probes : ProbesFile;
    mutation : MutationFile;
    browsers : BrowsersFile;
    bench : BenchFile;
};

export type SiteDataName = keyof SiteDataMap;
