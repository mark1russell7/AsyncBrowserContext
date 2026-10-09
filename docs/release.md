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
3. Commit the two changes and push them to `main`.
4. Make a tag with the version and push it:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

The workflow examines the tag. The tag must be `v` and the version of `package.json`. Then the workflow builds the package and checks the types. It starts all the tests and the STE lint. Then it publishes the package with a provenance statement. npm shows the statement on the page of the package.

## The first version

The first version, 0.1.0, was published from a computer, because a trusted publisher needs a package that exists. Before the publish, CI did all the tests on the commit of the version.
