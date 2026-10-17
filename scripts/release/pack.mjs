// Packs each published package of this repository into one folder, for the release workflow.
//
//   node scripts/release/pack.mjs <folder>
//
// pnpm packs each package: it applies publishConfig, and it replaces each workspace: range with a
// real range. The script writes <folder>/packages.txt with one line for each tarball,
// "name version file", a package after the packages of this repository that it depends on.
// Build the packages first. The script stops when a package depends on a git, file or link
// specifier, because npm users cannot install that package.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { publishedPackages, unpublishableDependencies } from "./workspace.mjs";

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

const shell = process.platform === "win32";
const lines = [];
for (const { dir, manifest } of packages) {
  const packed = execFileSync("pnpm", ["pack", "--json", "--pack-destination", resolve(out)], {
    cwd: dir,
    encoding: "utf8",
    shell,
  });
  const file = basename(JSON.parse(packed).filename);
  lines.push(`${manifest.name} ${manifest.version} ${file}`);
  process.stdout.write(`${manifest.name}@${manifest.version}: ${file}\n`);
}
writeFileSync(join(out, "packages.txt"), lines.length > 0 ? `${lines.join("\n")}\n` : "");
if (lines.length === 0) process.stdout.write("This repository has no published package.\n");
