// Packs each published package of this repository into one folder, for the release workflow.
//
//   node scripts/release/pack.mjs <folder>
//
// pnpm packs each package: it applies publishConfig, and it replaces each workspace: range with a
// real range. The script writes <folder>/packages.txt with one line for each tarball,
// "name version file", a package after the packages of this repository that it depends on.
// Build the packages first. The script stops when a package depends on a git, file or link
// specifier, because npm users cannot install that package. It also stops when a version is not
// SemVer, or is not greater than the "latest" version on npm (a version that is on npm is skipped).

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { publishedPackages, unpublishableDependencies, versionProblem } from "./workspace.mjs";

const out = process.argv[2];
if (out === undefined) {
  process.stderr.write("usage: node scripts/release/pack.mjs <folder>\n");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const packages = publishedPackages();
const blocked = packages.flatMap(({ manifest }) =>
  unpublishableDependencies(manifest).map((dependency) => `${manifest.name} -> ${dependency}`),
);
if (blocked.length > 0) {
  process.stderr.write(
    `These dependencies are not on npm. Change each one to an npm range before the release:\n  ${blocked.join("\n  ")}\n`,
  );
  process.exit(1);
}

const problems = [];
for (const { manifest } of packages) {
  const response = await fetch(`https://registry.npmjs.org/${manifest.name.replaceAll("/", "%2f")}`);
  if (!response.ok && response.status !== 404) throw new Error(`The registry gave HTTP ${response.status} for ${manifest.name}.`);
  const problem = versionProblem(manifest.version, response.status === 404 ? undefined : await response.json());
  if (problem) problems.push(`${manifest.name}: ${problem}`);
}
if (problems.length > 0) {
  process.stderr.write(`These versions cannot go to npm:\n  ${problems.join("\n  ")}\n`);
  process.exit(1);
}

const shell = process.platform === "win32";
const lines = [];
for (const { dir, manifest } of packages) {
  // The new file in the folder is the tarball. The output of pnpm is not used: it also holds the
  // output of the package scripts that pnpm pack starts (prepare, prepack).
  const before = new Set(readdirSync(out));
  execFileSync("pnpm", ["pack", "--pack-destination", resolve(out)], { cwd: dir, stdio: ["ignore", "inherit", "inherit"], shell });
  const added = readdirSync(out).filter((name) => !before.has(name) && name.endsWith(".tgz"));
  if (added.length !== 1) throw new Error(`pnpm pack of ${manifest.name} made ${added.length} tarballs: ${added.join(", ")}`);
  const file = basename(added[0]);
  lines.push(`${manifest.name} ${manifest.version} ${file}`);
  process.stdout.write(`${manifest.name}@${manifest.version}: ${file}\n`);
}
writeFileSync(join(out, "packages.txt"), lines.length > 0 ? `${lines.join("\n")}\n` : "");
if (lines.length === 0) process.stdout.write("This repository has no published package.\n");
