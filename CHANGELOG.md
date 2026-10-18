# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-18

### Added

- Pull request comment summarizing lockfile changes: packages added, removed, upgraded and downgraded, with major, minor, patch and prerelease labels, direct dependencies first and indirect ones folded away.
- Supports `package-lock.json` (v1 to v3), `npm-shrinkwrap.json`, `pnpm-lock.yaml` (v5 to v9), `yarn.lock` (classic and Berry) and `bun.lock`, including several lockfiles in one pull request.
- Install size change per package and in total, from the npm registry's unpacked sizes.
- One comment that is updated on every run, compared against the merge base.
- `fail-on` for major bumps, downgrades, additions or removals of direct dependencies.
- Outputs (`changed`, `added`, `removed`, `updated`, `major`, `size-delta`, `markdown`) and a job summary.
- Works without a checkout; warns instead of failing when it can't comment on fork pull requests.

[1.0.0]: https://github.com/acus9345/lockfile-diff-action/releases/tag/v1.0.0
