// The one-time npm setup of the packages of one or more repositories. The owner starts it.
//
//   node scripts/release/npm-bootstrap.mjs [<repo folder> ...] [options]
//
// npm trusts a GitHub workflow only for a package that exists, and a new trust expires when no
// publish uses it in 2 days. Thus, for each published package of each repository:
//   1. A new package gets a placeholder version 0.0.0-bootstrap.0 (dist-tag "bootstrap"). It holds
//      only a package.json and a README. The real versions come from the release workflow.
//   2. The package trusts the release workflow of its repository (`npm trust github`). The script
//      adds a trust only when the release workflow has a version to publish, so that the next
//      release run uses the trust in time.
//   3. The package gets "Require two-factor authentication and disallow tokens"
//      (`npm access set mfa=publish`). The trusted publisher still publishes: it uses no token.
// After that, start the release workflow of each repository in the next 2 days (--dispatch does it).
//
// npm asks for the 2FA of the owner. The script opens the npm page in the browser: confirm with
// the security key, and select the option to skip the 2FA for 5 minutes. A computer terminal is
// not necessary, so Claude can start the script.
//
// npm limits the requests of one account (HTTP 429). On 2026-10-12 it refused new packages after
// 25 new packages in one day. On 2026-10-17 it refused new packages and `npm access` changes after
// a day with many publishes. The script waits between the requests that change npm (--pause), and
// stops at the first 429. Start it again later: it skips each step that is done. npm cannot tell
// if a package disallows tokens, so the script records each lock in ~/.npm-bootstrap-locks.json.
//
// Options:
//   --dry-run         Shows the plan. It sends no request that needs the 2FA.
//   --file <name>     The workflow file of the trust (default release.yml).
//   --ref <ref>       The commit to read the packages from (default origin/main, after git fetch).
//                     The release workflow publishes main, not the working tree.
//   --env <name>      The GitHub environment of the trust. By default the script uses the
//                     environment of the workflow job, or none (the standard, refer to release.yml).
//   --only <a,b>      Only these packages.
//   --replace-trust   Replaces a trust that names a different workflow (only for a package with a
//                     version to publish).
//   --no-lock         Does not set "disallow tokens".
//   --lock-only       Only sets "disallow tokens" on each package that exists.
//   --dispatch        Starts the release workflow of each repository that got a new trust.
//   --lock-all        After the repositories, also sets "disallow tokens" on each other package of
//                     the npm user (from the npm search). Without a repository folder, only that.
//   --relock          Sets "disallow tokens" again on the packages that the record names.
//   --pause <s>       The seconds between the requests that change npm (default 3).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { githubRepository, publishedPackages, readRepoFile, root } from "./workspace.mjs";

const PLACEHOLDER = "0.0.0-bootstrap.0";
const REGISTRY = "https://registry.npmjs.org";
const LOCKS_FILE = join(homedir(), ".npm-bootstrap-locks.json");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const valued = new Set(["--file", "--env", "--only", "--ref", "--pause"]);
const repos = argv.filter((arg, i) => !arg.startsWith("--") && !valued.has(argv[i - 1])).map((dir) => resolve(dir));
const lockAll = flag("--lock-all");
if (repos.length === 0 && !lockAll) repos.push(root);

const dryRun = flag("--dry-run");
const workflow = value("--file") ?? "release.yml";
const environmentOption = value("--env");
const ref = value("--ref") ?? "origin/main";
const only = value("--only")?.split(",").map((s) => s.trim());
const replaceTrust = flag("--replace-trust");
const lock = !flag("--no-lock");
const lockOnly = flag("--lock-only");
const dispatch = flag("--dispatch");
const relock = flag("--relock");
const PAUSE_MS = Number(value("--pause") ?? "3") * 1000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

class RateLimited extends Error {}

// npm runs as `node npm-cli.js` when that file is found: no shell, so each argument stays exact.
const npmCli = [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), process.env.npm_execpath]
  .find((file) => typeof file === "string" && file.endsWith("npm-cli.js") && existsSync(file));

/** This function starts npm with JSON output and gives its status, its JSON and its text. */
function npmJson(args) {
  // Global options use the form `--key=value`: a command with strict flags (`npm trust`) reads `--key value` as a flag and a positional argument.
  const all = [...args, "--json", "--fetch-retries=0"];
  const r = npmCli
    ? spawnSync(process.execPath, [npmCli, ...all], { encoding: "utf8" })
    : spawnSync("npm", all, { encoding: "utf8", shell: process.platform === "win32" });
  const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  let json;
  const start = (r.stdout ?? "").search(/[[{]/);
  if (start !== -1) {
    try {
      json = JSON.parse(r.stdout.slice(start));
    } catch {
      json = undefined;
    }
  }
  return { ok: r.status === 0, json, text };
}

/** This function gives the npm token of the registry from ~/.npmrc, for the 2FA page. */
function registryToken() {
  const file = join(homedir(), ".npmrc");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith("//registry.npmjs.org/:_authToken="));
  return line?.slice(line.indexOf("=") + 1).trim();
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

/** This function waits until the owner confirms the 2FA in the browser, and gives the one-time token. */
async function webOtp(authUrl, doneUrl) {
  console.log(`\n  npm asks for the 2FA. Confirm it in the browser: ${authUrl}`);
  console.log("  Select the option to skip the 2FA for 5 minutes, so that the next steps need no new confirmation.\n");
  openBrowser(authUrl);
  const token = registryToken();
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(doneUrl, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (response.status === 200) return (await response.json()).token;
    if (response.status === 429) throw new RateLimited("npm limits the requests (429) during the 2FA.");
    if (response.status !== 202) throw new Error(`The 2FA page gave HTTP ${response.status}.`);
    const wait = Number(response.headers.get("retry-after") ?? "5");
    await sleep(Math.max(wait, 3) * 1000);
  }
  throw new Error("Nobody confirmed the 2FA in 5 minutes.");
}

/**
 * This function starts an npm command that changes npm, with the 2FA in the browser when npm asks.
 * npm takes a one-time password only once, so each command opens the 2FA page. In the 5 minutes
 * after the owner selects "skip the 2FA", that page confirms without a new tap.
 */
async function npmWrite(args) {
  let r = npmJson(args);
  const error = r.json?.error;
  if (!r.ok && error?.code === "EOTP" && error.authUrl && error.doneUrl) {
    const otp = await webOtp(error.authUrl, error.doneUrl);
    r = npmJson([...args, `--otp=${otp}`]);
  }
  if (!r.ok && /E429|Too Many Requests|rate limit/i.test(r.text)) throw new RateLimited(r.text.trim());
  await sleep(PAUSE_MS);
  return r;
}

/** This function reads the public data of a package: undefined when npm does not have it. */
async function packument(name) {
  const response = await fetch(`${REGISTRY}/${name.replaceAll("/", "%2f")}`);
  await sleep(300);
  if (response.status === 404) return undefined;
  if (response.status === 429) throw new RateLimited(`The registry gave HTTP 429 for ${name}.`);
  if (!response.ok) throw new Error(`The registry gave HTTP ${response.status} for ${name}.`);
  return response.json();
}

/** This function writes a placeholder package to a temporary folder. */
function placeholder(manifest, repository) {
  const dir = mkdtempSync(join(tmpdir(), "npm-bootstrap-"));
  const data = {
    name: manifest.name,
    version: PLACEHOLDER,
    description: `A placeholder that lets npm trust the release workflow of ${repository}. Use a later version.`,
    repository: { type: "git", url: `git+https://github.com/${repository}.git` },
    ...(manifest.license ? { license: manifest.license } : {}),
    publishConfig: { access: "public" },
  };
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(
    join(dir, "README.md"),
    `# ${manifest.name}\n\nThis version is a placeholder. The release workflow of https://github.com/${repository} publishes the real versions. Use a later version.\n`,
  );
  return dir;
}

/** This function tells if a trust list names the repository, the workflow and the environment. */
function trustMatches(list, repository, environment) {
  const text = JSON.stringify(list ?? "").toLowerCase();
  const sameEnvironment = environment ? text.includes(`"${environment.toLowerCase()}"`) : !/"environment":"[^"]/.test(text);
  return text.includes(repository.toLowerCase()) && text.includes(workflow.toLowerCase()) && sameEnvironment;
}

/** This function gives the GitHub environment of the jobs of a workflow, or undefined. */
function workflowEnvironment(text) {
  const match = /^\s*environment:\s*(?:\r?\n\s*name:\s*)?["']?([\w-]+)/m.exec(text ?? "");
  return match?.[1];
}

/** This function gives the IDs in a trust list. */
function trustIds(list) {
  const items = Array.isArray(list) ? list : (list?.trustedPublishers ?? list?.items ?? (list ? [list] : []));
  return items.map((item) => item?.id).filter(Boolean);
}

const summary = [];
const handled = new Set();
const trusted = new Set();

async function bootstrapRepo(repo) {
  const repository = githubRepository(repo);
  execFileSync("git", ["fetch", "--quiet", "origin"], { cwd: repo, stdio: "inherit" });
  let packages = publishedPackages(repo, ref);
  if (only) packages = packages.filter(({ manifest }) => only.includes(manifest.name));
  const workflowText = readRepoFile(repo, `.github/workflows/${workflow}`, ref);
  const environment = environmentOption ?? workflowEnvironment(workflowText);
  console.log(`\n${repository} (${repo} at ${ref}): ${packages.length} published package(s)`);
  console.log(`  trust: ${workflow}, ${environment ? `environment ${environment}` : "no environment"}`);
  if (workflowText === undefined) {
    console.warn(`  .github/workflows/${workflow} does not exist at ${ref}. The trust names it: add it before the release.`);
  }

  for (const { manifest } of packages) {
    const { name, version } = manifest;
    handled.add(name);
    const data = await packument(name);
    const exists = data !== undefined;
    const pending = data === undefined || data.versions?.[version] === undefined;
    const steps = [];

    if (lockOnly) {
      if (!exists) {
        summary.push(`${name}: not on npm, no lock`);
        continue;
      }
      summary.push(`${name}: ${await lockPackage(name)}`);
      console.log(`  ${summary.at(-1)}`);
      continue;
    }

    // 1. The placeholder of a new package
    if (data === undefined) {
      if (dryRun) {
        steps.push(`would publish the placeholder ${PLACEHOLDER}`);
      } else {
        const dir = placeholder(manifest, repository);
        try {
          const r = await npmWrite(["publish", dir, "--access", "public", "--tag", "bootstrap"]);
          if (!r.ok) throw new Error(`npm did not publish the placeholder of ${name}:\n${r.text.trim()}`);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
        steps.push(`published the placeholder ${PLACEHOLDER}`);
      }
    }

    // 2. The trust: only when the release workflow has a version to publish
    if (!pending) {
      steps.push(`${version} is on npm: no new trust (a trust that no publish uses expires in 2 days)`);
    } else if (dryRun) {
      steps.push(`would make sure that it trusts ${repository} ${workflow}${environment ? ` (environment ${environment})` : ""}`);
    } else {
      const listed = data === undefined ? { ok: true, json: [] } : await npmWrite(["trust", "list", name]);
      const list = listed.ok ? listed.json : undefined;
      if (trustMatches(list, repository, environment)) {
        steps.push(`trusts ${repository} ${workflow} already`);
      } else {
        const ids = trustIds(list);
        if (ids.length > 0 && !replaceTrust) {
          steps.push(`trusts a different workflow (${JSON.stringify(list)}): use --replace-trust`);
        } else {
          for (const id of ids) await npmWrite(["trust", "revoke", name, "--id", id]);
          const args = ["trust", "github", name, "--repo", repository, "--file", workflow, "--allow-publish", "--yes"];
          if (environment) args.push("--env", environment);
          let r = await npmWrite(args);
          // The registry can need some seconds before a new package accepts a trust.
          if (!r.ok && !exists && /E404|not found/i.test(r.text)) {
            await sleep(15_000);
            r = await npmWrite(args);
          }
          if (!r.ok) throw new Error(`npm did not add the trust of ${name}:\n${r.text.trim()}`);
          trusted.add(repository);
          steps.push(`trusts ${repository} ${workflow} now (publish ${version} in the next 2 days)`);
        }
      }
    }

    // 3. The lock
    if (lock) steps.push(await lockPackage(name));
    summary.push(`${name}@${version}: ${steps.join("; ")}`);
    console.log(`  ${summary.at(-1)}`);
  }
}

/** This function sets "disallow tokens" on each package of the npm user that the run did not handle. */
async function lockOtherPackages() {
  const user = dryRun ? "mark1russell7" : String(npmJson(["whoami"]).json ?? "").trim() || "mark1russell7";
  const response = await fetch(`${REGISTRY}/-/v1/search?text=maintainer:${user}&size=250`);
  if (!response.ok) throw new Error(`The npm search gave HTTP ${response.status}.`);
  const names = (await response.json()).objects.map((o) => o.package.name).filter((name) => !handled.has(name)).sort();
  console.log(`\nThe other packages of ${user}: ${names.length}`);
  for (const name of names) {
    summary.push(`${name}: ${await lockPackage(name)}`);
    console.log(`  ${summary.at(-1)}`);
  }
}

/** This function sets "disallow tokens" on a package, unless the record names it. It gives the step text. */
async function lockPackage(name) {
  const locks = existsSync(LOCKS_FILE) ? JSON.parse(readFileSync(LOCKS_FILE, "utf8")) : {};
  if (locks[name] && !relock) return `disallows tokens (since ${locks[name]}, from the record)`;
  if (dryRun) return "would set disallow tokens";
  const r = await npmWrite(["access", "set", "mfa=publish", name]);
  if (!r.ok) return `did not set disallow tokens: ${r.text.trim().split("\n")[0]}`;
  locks[name] = new Date().toISOString().slice(0, 10);
  writeFileSync(LOCKS_FILE, `${JSON.stringify(locks, null, 2)}\n`);
  return "disallows tokens";
}

let failure;
try {
  if (!dryRun) {
    const who = npmJson(["whoami"]);
    if (!who.ok) throw new Error("npm has no login on this computer. Start `npm login` first.");
    console.log(`npm user: ${String(who.json ?? who.text).trim()}`);
  }
  for (const repo of repos) await bootstrapRepo(repo);
  if (lockAll) await lockOtherPackages();
} catch (error) {
  failure = error;
}

console.log(`\nSummary${dryRun ? " (dry run)" : ""}:\n  ${summary.join("\n  ") || "nothing"}`);
if (trusted.size > 0) {
  for (const repository of trusted) {
    if (dispatch) {
      execFileSync("gh", ["workflow", "run", workflow, "--repo", repository, "--ref", "main"], { stdio: "inherit" });
      console.log(`Started ${workflow} of ${repository}.`);
    } else {
      console.log(`Start the release in the next 2 days: gh workflow run ${workflow} --repo ${repository} --ref main`);
    }
  }
}
if (failure instanceof RateLimited) {
  console.error(`\nnpm limits the requests of this account (HTTP 429). Start the same command again later. It skips each step that is done.\n${failure.message}`);
  process.exit(3);
} else if (failure) {
  console.error(`\n${failure.stack ?? failure}`);
  process.exit(1);
}
