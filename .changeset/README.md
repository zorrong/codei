# Changesets

This repo uses `changesets` to automate versioning across the `pnpm` workspace.

## Typical Flow

1. Add a changeset when a package change should be released:

```bash
pnpm changeset
```

2. Commit the generated markdown file under `.changeset/`.

3. After the PR is merged into `main`, the GitHub release workflow can open or update a release PR automatically.

4. When the release PR is merged, packages are versioned and published in dependency order.

## Manual Commands

```bash
pnpm run version-packages
pnpm run release:check
pnpm run release:publish:dry-run
```

See `docs/RELEASING.md` for the full release process.
