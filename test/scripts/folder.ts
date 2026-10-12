import fs from "node:fs";

/**
 * This function removes a work folder of a test script. Windows can lock the
 * files of a closed server or browser for a short time, thus `fs.rmSync`
 * tries again. If the folder stays, the function shows a warning. It does not
 * throw, so an earlier error of the script stays visible.
 */
export function removeFolder(folder : string) : void {
    try {
        fs.rmSync(folder, { recursive : true, force : true, maxRetries : 10, retryDelay : 500 });
    } catch (error) {
        console.warn(`Could not remove the work folder ${folder}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
