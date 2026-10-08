/**
 * The project word list: plain-language substitutions for the documentation
 * of this repository. This list is the style guide of the project, written
 * for it. It is not a copy of the ASD-STE100 dictionary. The local
 * dictionary file (refer to `dictionary.ts`) does that job, and it is not
 * part of the repository at any time.
 *
 * Each entry has the words or phrases to find, the words to write instead,
 * and a severity. `ste.config.json` can add entries, change them, or set an
 * entry to "off".
 */

import type { Severity } from "./types.js";

export type WordListEntry = {
    /** A short name of the entry. A configuration entry with the same ID changes this entry. */
    readonly id : string;
    /** The words and phrases to find. The match ignores case. */
    readonly match : readonly string[];
    /** The words to write instead, as the message shows them. Null when the fix is to remove the word. */
    readonly suggest : string | null;
    /** More help for the message, or null. */
    readonly note : string | null;
    readonly severity : Severity;
    /**
     * True when the word can be a noun too. Then the rule reports the word
     * only when the words near it show a verb ("Run the tests", but not "a
     * test run").
     */
    readonly verbOnly : boolean;
    /** A special context: "reference" finds "see" only where it tells the reader to look at other text. */
    readonly context : "reference" | null;
};

type EntryInput = {
    readonly match : readonly string[];
    readonly suggest? : string;
    readonly note? : string;
    readonly severity? : Severity;
    readonly verbOnly? : boolean;
    readonly context? : "reference";
    readonly id? : string;
};

function entry(input : EntryInput) : WordListEntry {
    return {
        id : input.id ?? input.match[0]!,
        match : input.match,
        suggest : input.suggest ?? null,
        note : input.note ?? null,
        severity : input.severity ?? "error",
        verbOnly : input.verbOnly ?? false,
        context : input.context ?? null,
    };
}

/** The default word list. */
export const DEFAULT_WORD_LIST : readonly WordListEntry[] = [
    // Long or formal words that have a short, common equivalent.
    entry({ match : ["utilize", "utilizes", "utilized", "utilizing", "utilization", "utilise", "utilises", "utilised", "utilising"], suggest : "\"use\"" }),
    entry({ match : ["initiate", "initiates", "initiated", "initiating"], suggest : "\"start\"" }),
    entry({ match : ["ensure", "ensures", "ensured", "ensuring"], suggest : "\"make sure\"", note : "Write \"that\" after it: \"make sure that ...\"." }),
    entry({ match : ["via"], suggest : "\"through\" or \"with\"" }),
    entry({ match : ["leverage", "leverages", "leveraged", "leveraging"], suggest : "\"use\"" }),
    entry({ match : ["facilitate", "facilitates", "facilitated", "facilitating"], suggest : "\"help\" or \"make ... easier\"" }),
    entry({ match : ["commence", "commences", "commenced", "commencing"], suggest : "\"start\"" }),
    entry({ match : ["terminate", "terminates", "terminated", "terminating"], suggest : "\"stop\"" }),
    entry({ match : ["obtain", "obtains", "obtained", "obtaining"], suggest : "\"get\"" }),
    entry({ match : ["assist", "assists", "assisted", "assisting"], suggest : "\"help\"" }),
    entry({ match : ["modify", "modifies", "modified", "modifying"], suggest : "\"change\"" }),
    entry({ match : ["indicate", "indicates", "indicated", "indicating"], suggest : "\"show\"" }),
    entry({ match : ["demonstrate", "demonstrates", "demonstrated", "demonstrating"], suggest : "\"show\"" }),
    entry({ match : ["perform", "performs", "performed", "performing"], suggest : "\"do\"" }),
    entry({ match : ["attempt", "attempts", "attempted", "attempting"], suggest : "\"try\"" }),
    entry({ match : ["numerous"], suggest : "\"many\", or give the number" }),
    entry({ match : ["additional"], suggest : "\"more\"" }),
    entry({ match : ["additionally"], suggest : "\"also\"" }),
    entry({ match : ["regarding"], suggest : "\"about\"" }),
    entry({ match : ["hence"], suggest : "\"thus\"" }),

    // Phrases that have a shorter equivalent.
    entry({ match : ["prior to"], suggest : "\"before\"" }),
    entry({ match : ["in order to"], suggest : "\"to\"" }),
    entry({ match : ["due to the fact that"], suggest : "\"because\"" }),
    entry({ match : ["due to"], suggest : "\"because of\"" }),
    entry({ match : ["in the event that"], suggest : "\"if\"" }),
    entry({ match : ["at this point in time"], suggest : "\"at this time\"" }),
    entry({ match : ["in an effort to"], suggest : "\"to\"" }),
    entry({ match : ["for the purpose of"], suggest : "\"to\" or \"for\"" }),
    entry({ match : ["with respect to", "with regard to"], suggest : "\"about\" or \"for\"" }),
    entry({ match : ["as well as"], suggest : "\"and\"" }),
    entry({ match : ["a number of"], suggest : "\"some\", or give the number" }),
    entry({ match : ["is able to", "are able to", "be able to"], suggest : "\"can\"" }),
    entry({ match : ["such as"], suggest : "\"for example\"" }),
    entry({ match : ["follow these steps", "follow the steps"], suggest : "\"do these steps\" or \"do the steps\"" }),

    // Connecting words.
    entry({ match : ["however"], suggest : "\"but\"", note : "Start a new sentence with \"But\" if necessary." }),
    entry({ match : ["therefore"], suggest : "\"thus\" or \"as a result\"" }),
    entry({ match : ["whether or not", "whether"], suggest : "\"if\"" }),

    // Verbs that have a simpler equivalent.
    entry({ match : ["allow", "allows", "allowed", "allowing"], suggest : "\"let\" or \"lets\"", note : "For an adjective, write \"permitted\"." }),
    entry({ match : ["require", "requires", "required", "requiring"], suggest : "\"necessary\"", note : "For example, write \"X is necessary for Y\", or use the imperative." }),
    entry({ match : ["provided that"], suggest : "\"if\"" }),
    entry({ match : ["provide", "provides", "provided", "providing"], suggest : "\"give\" or \"gives\"" }),
    entry({ match : ["execute", "executes", "executed", "executing"], suggest : "\"do\", \"does\" or \"start\"" }),
    entry({ match : ["create", "creates", "created", "creating"], suggest : "\"make\" or \"makes\"" }),
    entry({ match : ["kill", "kills", "killed", "killing"], suggest : "\"stop\"" }),
    entry({ id : "displays", match : ["displayed", "displaying"], suggest : "\"show\" or \"shows\"", severity : "warning" }),
    entry({ id : "display", match : ["display", "displays"], suggest : "\"show\" or \"shows\"", severity : "warning", verbOnly : true }),
    entry({ id : "returns", match : ["returns", "returned", "returning"], suggest : "\"gives\"", severity : "warning", note : "For a function, write \"This function gives ...\"." }),
    entry({ id : "return", match : ["return"], suggest : "\"give\" or \"gives\"", severity : "warning", verbOnly : true }),
    entry({ id : "call", match : ["call", "calls", "called", "calling"], suggest : "\"use\" or \"start\"", severity : "warning", verbOnly : true, note : "This applies when the verb means to start a function." }),
    entry({ id : "ran", match : ["ran"], suggest : "\"started\" or \"operated\"", severity : "warning" }),
    entry({ id : "run", match : ["run", "runs", "running"], suggest : "\"start\", \"starts\" or \"operates\"", severity : "warning", verbOnly : true }),
    entry({ id : "see", match : ["see"], suggest : "\"refer to\"", severity : "warning", context : "reference" }),

    // Words that do not add information.
    entry({ match : ["simple", "simply", "easily"], severity : "warning", note : "The word tells the reader what to think. Tell the reader what to do." }),
    entry({ match : ["just"], suggest : "\"only\"", severity : "warning", note : "Or remove the word." }),
    entry({ match : ["basically", "obviously", "of course"], severity : "warning", note : "The word does not add information." }),
    entry({ match : ["please"], severity : "warning", note : "Write the instruction in the imperative." }),

    // Time and negation.
    entry({ match : ["currently", "now"], suggest : "\"at this time\"", note : "Or remove the word if the time is clear." }),
    entry({ match : ["never"], suggest : "\"do not\"", note : "For a description, write \"not ... at any time\"." }),
];
