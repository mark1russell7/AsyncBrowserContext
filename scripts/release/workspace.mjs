// The published packages of this repository, for the release scripts.
//
// A published package is a package.json that is not private: the root package.json, or one in
// packages/*. The list has a package after the packages of this repository that it depends on.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

/** This function gives the text of a file of a repository: from the disk, or from a git ref. */
export function readRepoFile(repo, path, ref) {
  if (ref === undefined) {
    const file = join(repo, path);
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  }
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

/** This function gives the folders in packages/ of a repository: from the disk, or from a git ref. */
function packageFolders(repo, ref) {
  if (ref === undefined) {
    const packagesDir = join(repo, "packages");
    return existsSync(packagesDir) ? readdirSync(packagesDir).sort().map((name) => `packages/${name}`) : [];
  }
  const out = execFileSync("git", ["ls-tree", "-d", "--name-only", ref, "packages/"], { cwd: repo, encoding: "utf8" });
  return out.split(/\r?\n/).filter(Boolean).sort();
}

/**
 * This function gives the published packages of a repository, in the sequence of their dependencies.
 * With a git ref (for example `origin/main`), it reads the package.json files of that commit.
 */
export function publishedPackages(repo = root, ref = undefined) {
  const packages = ["", ...packageFolders(repo, ref)]
    .map((folder) => ({ folder, text: readRepoFile(repo, folder ? `${folder}/package.json` : "package.json", ref) }))
    .filter(({ text }) => text !== undefined)
    .map(({ folder, text }) => ({ dir: join(repo, folder), manifest: JSON.parse(text) }))
    .filter(({ manifest }) => !manifest.private && typeof manifest.name === "string");

  const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
  const ordered = [];
  const visit = (entry, path = []) => {
    if (ordered.includes(entry)) return;
    if (path.includes(entry)) throw new Error(`a dependency cycle at ${entry.manifest.name}`);
    const { dependencies = {}, peerDependencies = {}, optionalDependencies = {} } = entry.manifest;
    for (const name of Object.keys({ ...dependencies, ...peerDependencies, ...optionalDependencies })) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency, [...path, entry]);
    }
    ordered.push(entry);
  };
  packages.forEach((entry) => visit(entry));
  return ordered;
}

/**
 * This function gives the dependencies that npm users cannot install: git, file and link specifiers.
 * A package can use them during development, but not in a release.
 */
export function unpublishableDependencies(manifest) {
  const { dependencies = {}, peerDependencies = {}, optionalDependencies = {} } = manifest;
  return Object.entries({ ...dependencies, ...peerDependencies, ...optionalDependencies })
    .filter(([, spec]) => /^(github:|git\+|git:|file:|link:|https?:)/.test(spec) || /^[\w.-]+\/[\w.-]+(#.*)?$/.test(spec))
    .map(([name, spec]) => `${name}@${spec}`);
}

/** This function gives "owner/repo" of the GitHub remote "origin". */
export function githubRepository(repo = root) {
  const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: repo, encoding: "utf8" }).trim();
  const match = /github\.com[:/]([^/]+)\/(.+?)(\.git)?$/.exec(url);
  if (!match) throw new Error(`The remote "origin" of ${repo} is not on GitHub: ${url}`);
  return `${match[1]}/${match[2]}`;
}
