// The start of the release workflow by a script (npm-bootstrap.mjs --dispatch).
//
// A release publishes only a commit that is on main: the head of main, or an older commit of main
// (RELEASING.md). The first step of the build job (reusable-release-build.yml) compares the commit
// of the run with main and stops for a different commit. Thus a script starts a release only after
// the same check: the GitHub compare API, main...<commit>.

import { execFileSync } from "node:child_process";

/** The statuses of the GitHub compare API (main...<commit>) for a commit that is on main. */
export const ON_MAIN = new Set(["identical", "behind"]);

/** This function starts gh and gives its output text. Its error has the error text of gh. */
function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(String(error.stderr ?? "").trim() || error.message);
  }
}

/**
 * This function compares a commit with main on GitHub (one `gh api` call). It gives the status of the
 * compare API: "identical", "behind", "ahead" or "diverged". It throws when GitHub does not compare,
 * for example for a commit that is not on GitHub.
 */
export function compareWithMain(repository, sha, run = gh) {
  return run(["api", `repos/${repository}/compare/main...${sha}`, "--jq", ".status"]).trim();
}

/**
 * This function tells what the bootstrap script does for each repository that got a new trust. It
 * gives { repository, start, text } for each one: start is true when the script starts the release.
 * `failed` is true when the bootstrap stopped before the end. `commits` has the commit of the
 * packages of each repository. `compare(repository, sha)` gives the status of compareWithMain(),
 * and the function calls it only when it can start the release.
 */
export function dispatchPlan({ repositories, workflow, dispatch, failed, commits, compare }) {
  return [...repositories].map((repository) => {
    const command = `gh workflow run ${workflow} --repo ${repository} --ref main`;
    if (!dispatch) return { repository, start: false, text: `Start the release in the next 2 days: ${command}` };
    if (failed) {
      return {
        repository,
        start: false,
        text:
          `The bootstrap stopped before the end, so the script did not start the release of ${repository}. ` +
          `Start the bootstrap again. When it is done, start the release in the next 2 days: ${command}`,
      };
    }
    const sha = commits.get(repository);
    let status;
    try {
      status = compare(repository, sha);
    } catch (error) {
      status = `not known (GitHub did not compare it with main: ${String(error.message ?? error).trim().split("\n")[0]})`;
    }
    if (!ON_MAIN.has(status)) {
      return {
        repository,
        start: false,
        text:
          `The packages come from the commit ${sha}, and that commit is not on main (status: ${status}). ` +
          `A release publishes only a commit on main, so the script did not start the release of ${repository}. ` +
          `Merge the change to main. Then start the release in the next 2 days: ${command}`,
      };
    }
    return { repository, start: true, text: `Started ${workflow} of ${repository}.` };
  });
}
