# Releasing to npm

The workflow `.github/workflows/release.yml` publishes the packages of this repository to npm. The only published package is `async-browser-context` (the root `package.json`). `docs/release.md` tells the steps for this package. It uses npm trusted publishing (OIDC), so it needs no npm token. Each version gets a provenance statement.

## The workflow files

`release.yml` is short. Its jobs use the shared release workflows and the action `npm-publish` of the template ([`CI.md`](https://github.com/mark1russell7/template/blob/main/CI.md)):

| Job | What it uses |
|---|---|
| `verify` | The `ci.yml` of the repository. |
| `build` | `reusable-release-build.yml` of the template, with `scripts/release/pack.mjs` and `scripts/release/tags.mjs` of the repository. |
| `publish` | A job of `release.yml`. Its step is the action `npm-publish` of the template. |
| `tag` | `reusable-release-tag.yml` of the template. |

The job `publish` stays in `release.yml`. The trusted publisher of each package names this repository and `release.yml`. A composite action operates in the job that uses it, so npm sees the same workflow as before. The [`CI.md` of the template](https://github.com/mark1russell7/template/blob/main/CI.md) tells the reasons.

Each `uses:` of the template has a pin to a commit of `main`. Renovate does not change `release.yml`. The release session moves the pins:

1. Merge the change of the template.
2. In each repository, change the commit of each `mark1russell7/template/...@<commit> # main` line of `release.yml` to the new commit.
3. Merge that change. The next release uses it.

## Who publishes

The owner (Mark) and one Claude session that the owner names are responsible for all npm publishes. Other Claude sessions obey these rules:

- Do not start `npm publish`, `pnpm publish`, `npm login`, `npm trust` or `npm access`.
- Do not change the npm settings of a package.
- Do not edit `release.yml` or the files in `scripts/release/`.
- When a package that is not on npm blocks your work, use `workspace:*` in this repository. Use a `github:` specifier pinned to a commit for a package in a different repository.
- Tell the owner the name, the version and the SemVer reason of each package that you want on npm.

`scripts/release/pack.mjs` stops the release when a published package has a `github:`, `file:` or `link:` dependency. Change each one to an npm range before the release.

## A release of a package that is on npm

1. Choose the next version with the SemVer rules. A breaking change increases MAJOR, a new feature MINOR, and a fix PATCH.
2. Before `1.0.0`, a breaking change increases MINOR. A feature or a fix increases PATCH. Do not go to `1.0.0` without the owner.
3. For a prerelease, add a hyphen suffix, for example `1.2.0-rc.1`.
4. Change `version` in the `package.json` of the package. In the pull request, give the SemVer reason.
5. Merge the change to `main`.

The push to `main` starts `release.yml`. The workflow starts the CI gates, builds and packs each published package, and publishes each version that is not on npm. Then it makes a git tag and a GitHub release for each new version. A version with a hyphen, for example `1.2.0-rc.1`, gets the dist-tag `next`. The other versions get `latest`.

`scripts/release/pack.mjs` stops the release when a version is not SemVer. It also stops when a version is not greater than the `latest` version on npm. The registry does not accept a version two times, also after a removal. Thus a bad release gets a new PATCH, and `npm deprecate` marks the bad version.

To publish again after a failure, start the workflow by hand: `gh workflow run release.yml --ref main`. It skips each version that is on npm.

## Only a commit on main

A release publishes only a commit that is on `main`. The first step of the build job compares the commit of the run with `main`, with the GitHub compare API. The commit must be the head of `main` or an older commit of `main`. For a different commit, the step fails. Then the run publishes nothing and makes no tag.

- A manual run on the branch of a pull request does not publish the code of that branch. Merge the pull request first.
- A temporary branch `release/<version>` at a version commit of `main` is correct. Use it to publish the version of an older commit when `main` has newer changes: `gh workflow run release.yml --ref release/<version>`.
- For a new package, merge the pull request of the version first. Then start the release on `main` ("A new package").
- The input `require-main` of `reusable-release-build.yml` turns on the check. Its default is `true`. Only `actions-test.yml` of the template sets `false`, for the commits of pull requests.

## Git tags and GitHub releases

After the publish, the job `tag` of `release.yml` makes a git tag and a GitHub release for each version that the run published.

- In a repository with one published package, the tag is `v<version>`, for example `v1.2.0`.
- In a repository with more published packages, the tag is `<name>@<version>`, for example `@mark1russell7/vex@0.9.0`. Changesets uses the same tags.
- The text of the release is the section of the version in the `CHANGELOG.md` of the package. Without a section, the text is one line with a link to npm.
- A version with a hyphen is a prerelease on GitHub. GitHub does not show it as the latest release.
- The Releases page of `@mark1russell7/site-pages` reads these releases.

The build job writes the plan of the tags and the release texts (`scripts/release/tags.mjs`). The job `tag` has only the permission `contents: write`. It starts no code of the repository. `gh release create` makes each tag on GitHub, at the commit of the release.

When a repository gets a second published package, the next tags use `<name>@<version>`.

A repository with its own `tags.mjs` can change the plan. For example, it can give each release a title and the tarballs as files ([`CI.md` of the template](https://github.com/mark1russell7/template/blob/main/CI.md)).

### A second run

The job skips each tag that exists. Thus a second run of the workflow does no harm.

A run also tags a version that it did not publish, but only when these two conditions are true:

- npm has the version with a provenance statement from this repository.
- The repository has no tag for the version.

The tag then goes on the commit that the provenance statement names. That commit is the source of the version. Thus a run after a failure adds the missing tags. A version without a provenance statement gets no tag, for example a version that a person published by hand.

### A tag that GitHub refuses

The token of a workflow cannot change workflow files. Thus GitHub refuses a tag from the workflow (HTTP 403) when the workflow files of the commit differ from the workflow files of each branch.

- An old commit gets no tag after a change to a workflow file. For example, the versions before a repository copies this `release.yml` get no tag from the workflow.
- For a version that the run published, the job fails. For a different version, the job gives a warning.
- For each refused tag, the summary of the run shows a `gh release create` command. Start it with your own GitHub token.

### Tag rulesets

A tag ruleset of the repository must not block the creation of tags by GitHub Actions. A ruleset that blocks only the update and the deletion of tags is correct. For example, the ruleset "release tags" of `crawler` blocks only the update and the deletion of `v*` tags.

## A new package

npm trusts a workflow only for a package that exists. A new trust expires when no publish uses it in 2 days. Thus the owner bootstraps each new package one time, on the day of its first release:

```sh
node scripts/release/npm-bootstrap.mjs --dry-run
node scripts/release/npm-bootstrap.mjs --dispatch
```

The script reads the packages of `origin/main`. For each new package, it publishes a placeholder version `0.0.0-bootstrap.0` with the dist-tag `bootstrap`. Then it connects the package to `release.yml` (`npm trust github`) and sets "Require two-factor authentication and disallow tokens" (`npm access set mfa=publish`). With `--dispatch`, it starts `release.yml` on `main`, which publishes the real version.

The release publishes only a commit on `main`. Thus merge the pull request of the version before the bootstrap. `--dispatch` starts the release only in these two conditions:

- The bootstrap had no failure.
- The commit of `--ref` is on `main`. One `gh api` call to the compare API examines it.

Else the script shows the reason and the command `gh workflow run release.yml --repo <owner/repo> --ref main`. Start that command after the merge, in the 2 days of the trust.

Without the bootstrap, the release publishes the other packages and then fails with the names of the new packages. With the input `new-packages: warning` of the action `npm-publish`, the release gives a warning and does not fail.

npm asks for the 2FA. The script opens the npm page in the browser. Confirm with the security key. Select the option to skip the 2FA for 5 minutes.

npm asks for each change. In those 5 minutes, the page confirms without a new key tap. The script accepts more than one repository folder.

## Limits of npm

- npm limits the new packages of one account. On 2026-10-12, npm refused new packages with HTTP 429 after 25 new packages in one day. Bootstrap fewer than 25 packages each day.
- On 2026-10-17, after a day with many publishes, npm also refused new packages and `npm access` changes with HTTP 429.
- When npm gives HTTP 429, stop. Start the same command again later. Each script skips the steps that are done.
- npm cannot show if a package disallows tokens. Thus the bootstrap script records each lock in `~/.npm-bootstrap-locks.json`.
- `--pause <seconds>` sets a longer time between the changes (default 3). Use it for long runs, for example `--lock-all`.
- The trusted publishers name no GitHub environment. npm cannot match an environment for a repository with the immutable OIDC subject of GitHub ([npm/cli#9969](https://github.com/npm/cli/issues/9969)). New repositories have that subject.
- Trusted publishing needs npm 11.5.1 or later. `npm trust` needs npm 11.15.0 or later.

## The state of the packages

```sh
node scripts/release/npm-audit.mjs            # the packages of this repository
node scripts/release/npm-audit.mjs --all      # each package of the npm user
```

The audit uses only public data. It shows the latest version of each package, if a trusted publisher published it, and if `main` has a version that is not on npm.
