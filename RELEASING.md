# Releasing to npm

The workflow `.github/workflows/release.yml` publishes the packages of this repository to npm. The only published package is `async-browser-context` (the root `package.json`). `docs/release.md` tells the steps for this package. It uses npm trusted publishing (OIDC), so it needs no npm token. Each version gets a provenance statement.

## Who publishes

The owner (Mark) and one Claude session that the owner names are responsible for all npm publishes. Other Claude sessions obey these rules:

- Do not start `npm publish`, `pnpm publish`, `npm login`, `npm trust` or `npm access`.
- Do not change the npm settings of a package.
- Do not edit `release.yml` or the files in `scripts/release/`.
- When a package that is not on npm blocks your work, use `workspace:*` in this repository. Use a `github:` specifier pinned to a commit for a package in a different repository.
- Tell the owner the name, the version and the SemVer reason of each package that you want on npm.

`scripts/release/pack.mjs` stops the release when a published package has a `github:`, `file:` or `link:` dependency. Change each one to an npm range before the release.

## A release of a package that is on npm

1. Choose the next version with the SemVer rules. Before `1.0.0`, a breaking change increases MINOR.
2. Change `version` in the `package.json` of the package.
3. Merge the change to `main`.

The push to `main` starts `release.yml`. The workflow starts the CI gates, builds and packs each published package, and publishes each version that is not on npm. A version with a hyphen, for example `1.2.0-rc.1`, gets the dist-tag `next`. The other versions get `latest`.

To publish again after a failure, start the workflow by hand: `gh workflow run release.yml --ref main`. It skips each version that is on npm.

## A new package

npm trusts a workflow only for a package that exists. A new trust expires when no publish uses it in 2 days. Thus the owner bootstraps each new package one time, on the day of its first release:

```sh
node scripts/release/npm-bootstrap.mjs --dry-run
node scripts/release/npm-bootstrap.mjs --dispatch
```

The script reads the packages of `origin/main`. For each new package, it publishes a placeholder version `0.0.0-bootstrap.0` with the dist-tag `bootstrap`. Then it connects the package to `release.yml` (`npm trust github`) and sets "Require two-factor authentication and disallow tokens" (`npm access set mfa=publish`). With `--dispatch`, it starts `release.yml`, which publishes the real version.

npm asks for the 2FA. The script opens the npm page in the browser. Confirm with the security key, and select the option to skip the 2FA for 5 minutes. The script accepts more than one repository folder, so one 2FA can cover all of them.

## Limits of npm

- npm limits the new packages of one account. On 2026-10-12, npm refused new packages with HTTP 429 after 25 new packages in one day. Bootstrap fewer than 25 packages each day.
- When npm gives HTTP 429, stop. Start the same command again later. Each script skips the steps that are done.
- The trusted publishers name no GitHub environment. npm cannot match an environment for a repository with the immutable OIDC subject of GitHub ([npm/cli#9969](https://github.com/npm/cli/issues/9969)). New repositories have that subject.
- Trusted publishing needs npm 11.5.1 or later. `npm trust` needs npm 11.15.0 or later.

## The state of the packages

```sh
node scripts/release/npm-audit.mjs            # the packages of this repository
node scripts/release/npm-audit.mjs --all      # each package of the npm user
```

The audit uses only public data. It shows the latest version of each package, if a trusted publisher published it, and if `main` has a version that is not on npm.
