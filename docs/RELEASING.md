# Releasing codei

This repo is a `pnpm` workspace monorepo. Public npm packages live in `packages/*` and are published in dependency order:

1. `@pnftrading/codei-core`
2. language adapters
3. `@pnftrading/codei`

## Pre-release Checklist

Before publishing, make sure you have:

- updated package versions you want to release
- updated changelog or release notes
- valid npm authentication (`npm login` or `NPM_TOKEN`)
- a clean git state

## Release Commands

Create a changeset for a package change:

```bash
pnpm changeset
```

Apply version bumps and changelog updates locally:

```bash
pnpm run version-packages
```

Run a full release verification:

```bash
pnpm run release:check
```

This command verifies that:

- all public packages already have `dist/`
- each public package has its own `README.md`
- packed tarballs can be generated successfully
- packed manifests no longer contain `workspace:*` dependency ranges

Run a dry-run publish:

```bash
pnpm run release:publish:dry-run
```

This performs a local publish simulation:

- runs `release:check`
- prints the publish order
- prints the exact `pnpm publish` commands that would run

It does not hit the npm registry, so you can use it safely on a dirty branch or before bumping versions.

Publish for real:

```bash
pnpm run release:publish
```

## Notes

- The GitHub workflow at `.github/workflows/release.yml` uses `changesets/action` to open or update a release PR automatically on `main`.
- To enable npm publishing from GitHub Actions, add an `NPM_TOKEN` repository secret with publish access to the `@pnftrading` scope.
- `release:publish` runs `release:check` first.
- Packages are published in topological dependency order so `@pnftrading/codei-core` is available before adapters and `@pnftrading/codei`.
- The website package is private and is not part of npm publishing.
- CI also runs `pnpm run release:check` on pushes and pull requests to keep npm artifacts healthy.
