# Release

This document tells how to publish a new version of `async-browser-context` to npm.

## Set up the trusted publisher (one time)

The workflow `.github/workflows/release.yml` publishes the package. It uses npm trusted publishing, so the repository needs no npm token.

1. Sign in to <https://www.npmjs.com> as an owner of the package.
2. Open the settings of the package `async-browser-context`.
3. In "Trusted publishing", add a publisher of the type "GitHub Actions" with these values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `mark1russell7` |
   | Repository | `AsyncBrowserContext` |
   | Workflow file name | `release.yml` |

## Publish a version

1. Change the version in `package.json`, for example to `0.2.0`.
2. Add the changes to `CHANGELOG.md`, below a heading with the version.
3. Merge the two changes to `main`.

The push to `main` starts the workflow. The workflow starts all the gates of `ci.yml`: the build, the types, all the tests and the STE lint. Then it packs the package and publishes the tarball with a provenance statement. npm shows the statement on the page of the package. The workflow skips a version that is already on npm.

After the publish, the workflow makes the git tag `v<version>` and a GitHub release with the text of `CHANGELOG.md` for the version. `RELEASING.md` tells the standard procedure.

## The first version

The first version, 0.1.0, was published from a computer, because a trusted publisher needs a package that exists. Before the publish, CI did all the tests on the commit of the version.
