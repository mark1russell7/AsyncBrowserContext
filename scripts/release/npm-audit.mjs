// Shows the npm state of packages from public data only: no login and no 2FA.
//
//   node scripts/release/npm-audit.mjs [<repo folder> ...]    the published packages of these repositories
//   node scripts/release/npm-audit.mjs --all [--user <name>]  each package of the npm user (default mark1russell7)
//
// For each package: the latest version, if a trusted publisher (OIDC) published it, if it has a
// provenance statement, and for a repository, if npm has the version of its package.json on main.
// The trusted publisher and the lock ("disallow tokens") are not public: npm-bootstrap.mjs sets them.

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { publishedPackages, root } from "./workspace.mjs";

const argv = process.argv.slice(2);
const all = argv.includes("--all");
const userIndex = argv.indexOf("--user");
const user = userIndex === -1 ? "mark1russell7" : argv[userIndex + 1];
const repos = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--user").map((dir) => resolve(dir));
if (!all && repos.length === 0) repos.push(root);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** This function gives the names of each package that the npm user maintains. */
async function packagesOf(name) {
  const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=maintainer:${name}&size=250`);
  if (!response.ok) throw new Error(`The npm search gave HTTP ${response.status}.`);
  return (await response.json()).objects.map((o) => ({ name: o.package.name })).sort((a, b) => a.name.localeCompare(b.name));
}

// The release workflow publishes main: the script reads the package.json files of origin/main.
const targets = all
  ? await packagesOf(user)
  : repos.flatMap((repo) => {
      execFileSync("git", ["fetch", "--quiet", "origin"], { cwd: repo, stdio: "inherit" });
      return publishedPackages(repo, "origin/main").map(({ manifest }) => ({ name: manifest.name, local: manifest.version }));
    });

const rows = [];
for (const { name, local } of targets) {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  await sleep(250);
  if (response.status === 404) {
    rows.push({ name, latest: "-", oidc: "-", provenance: "-", local: local ?? "", state: "NEW: needs npm-bootstrap" });
    continue;
  }
  if (!response.ok) {
    rows.push({ name, latest: "?", oidc: "?", provenance: "?", local: local ?? "", state: `HTTP ${response.status}` });
    continue;
  }
  const data = await response.json();
  const latest = data["dist-tags"]?.latest ?? Object.keys(data.versions ?? {}).at(-1) ?? "-";
  const meta = data.versions?.[latest] ?? {};
  const oidc = meta._npmUser?.trustedPublisher ? "yes" : "no";
  const provenance = meta.dist?.attestations ? "yes" : "no";
  const states = [];
  if (local && !data.versions?.[local]) states.push(`${local} to publish`);
  if (oidc === "no") states.push("latest was a manual publish");
  if (data["dist-tags"]?.bootstrap && Object.keys(data.versions ?? {}).length === 1) states.push("only the placeholder");
  rows.push({ name, latest, oidc, provenance, local: local ?? "", state: states.join(", ") || "ok" });
}

const columns = ["name", "latest", "oidc", "provenance", "local", "state"];
const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
const line = (r) => columns.map((c, i) => String(r[c]).padEnd(widths[i])).join("  ");
console.log(line(Object.fromEntries(columns.map((c) => [c, c]))));
for (const row of rows) console.log(line(row));
