import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { HELPER_NAMES } from "../src/debugger/helper-names.ts";
import { highlightLines } from "./highlight.ts";
import { instrumentScenario, splitScenario } from "./instrument.ts";

/** The ID of the module that gives the list of the debugger scenarios. */
export const DEBUGGER_SCENARIOS_ID = "virtual:debugger-scenarios";
const RESOLVED_ID = `\0${DEBUGGER_SCENARIOS_ID}`;
const INSTRUMENTED = "?instrumented";
const SUFFIX = ".scenario.js";
/** The folder of the scenarios and the traced library, below the root of the site. */
const SCENARIO_DIR = "src/debugger/scenarios";
const LIBRARY = "/src/debugger/instrumented.ts";

/**
 * This plugin serves the scenarios of the context debugger:
 *
 * - `virtual:debugger-scenarios` gives the title, the summary, the source
 *   and the highlighted lines of each file `src/debugger/scenarios/*.scenario.js`,
 *   and a function that loads the instrumented module of the scenario.
 * - `<file>.scenario.js?instrumented` gives the instrumented module (see
 *   `instrumentScenario`). The Vite plugin of the library then transforms it.
 *
 * The page shows the same source that runs.
 */
export function debuggerPlugin() : Plugin {
    let root = "";
    return {
        name : "abc-site:debugger",
        enforce : "pre",
        configResolved(config) {
            root = config.root;
        },
        resolveId(id) {
            return id === DEBUGGER_SCENARIOS_ID ? RESOLVED_ID : null;
        },
        async load(id) {
            if (id === RESOLVED_ID) {
                const dir = path.join(root, SCENARIO_DIR);
                const files = (await readdir(dir)).filter(name => name.endsWith(SUFFIX)).sort();
                const entries : string[] = [];
                const list : { order : number; entry : string }[] = [];
                for (const name of files) {
                    const file = path.join(dir, name);
                    this.addWatchFile(file);
                    const scenarioId = name.slice(0, -SUFFIX.length);
                    const { meta, source } = splitScenario(await readFile(file, "utf8"), scenarioId);
                    const lines = await highlightLines(source);
                    const url = `/${SCENARIO_DIR}/${name}${INSTRUMENTED}`;
                    list.push({
                        order : meta.order,
                        entry : `{ id : ${JSON.stringify(scenarioId)}, title : ${JSON.stringify(meta.title)}, summary : ${JSON.stringify(meta.summary)}, source : ${JSON.stringify(source)}, lines : ${JSON.stringify(lines)}, load : () => import(${JSON.stringify(url)}) }`,
                    });
                }
                list.sort((a, b) => a.order - b.order);
                entries.push(...list.map(item => item.entry));
                return { code : `export default [\n${entries.join(",\n")}\n];\n`, map : null };
            }
            if (id.endsWith(`${SUFFIX}${INSTRUMENTED}`)) {
                const file = id.slice(0, -INSTRUMENTED.length);
                const name = path.basename(file);
                const { source } = splitScenario(await readFile(file, "utf8"), name);
                return { code : instrumentScenario(source, { library : LIBRARY, helpers : HELPER_NAMES }), map : null };
            }
            return null;
        },
    };
}
