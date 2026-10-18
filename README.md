# Lockfile Diff Summary

A GitHub Action that comments on pull requests with a readable summary of what changed in your lockfile: packages added, removed, upgraded or downgraded, which bumps are major, and how much bigger installs get.

[![CI](https://github.com/acus9345/lockfile-diff-action/actions/workflows/ci.yml/badge.svg)](https://github.com/acus9345/lockfile-diff-action/actions/workflows/ci.yml)

A 4,000-line `package-lock.json` diff is unreviewable, so it usually isn't reviewed. This action turns it into a short comment that keeps itself up to date as the pull request changes:

> ### 📦 Dependency changes in `package-lock.json`
>
> **2 added · 1 removed · 3 updated** (2 direct) · 1 major bump · install size **+1.4 MB**
>
> | Package | Change | Type | Size |
> | --- | --- | --- | ---: |
> | [**react**](https://www.npmjs.com/package/react) | 18.3.1 → 19.0.0 | 🔴 major | +120 kB |
> | [**zod**](https://www.npmjs.com/package/zod) | added 3.23.8 |  | +1.3 MB |
>
> <details><summary>4 indirect changes</summary>…</details>

- **npm, pnpm, Yarn (classic and Berry) and Bun:** `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`. Monorepos with several lockfiles get one section each.
- **Direct dependencies first**, in bold. Indirect changes are folded away.
- **Install size** from the npm registry's unpacked sizes, per package and in total.
- **One comment, kept current:** it's edited on every push instead of piling up, and says so when the lockfile stops changing.
- **Compared to the merge base**, like the "Files changed" tab, so changes that landed on the base branch don't show up.
- No checkout needed and no dependencies: it reads the files through the GitHub API.

## Usage

```yaml
# .github/workflows/lockfile-diff.yml
name: Lockfile diff

on:
  pull_request:
    paths:
      - "**/package-lock.json"
      - "**/pnpm-lock.yaml"
      - "**/yarn.lock"
      - "**/bun.lock"

permissions:
  contents: read
  pull-requests: write

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: acus9345/lockfile-diff-action@v1
```

That's all. The `paths` filter is optional; it keeps the workflow from running on pull requests that don't touch a lockfile.

### Fail on risky changes

```yaml
      - uses: acus9345/lockfile-diff-action@v1
        with:
          fail-on: major, downgrade
```

`fail-on` applies to direct dependencies only, since indirect major bumps are common and usually harmless.

### Use the result in later steps

```yaml
      - uses: acus9345/lockfile-diff-action@v1
        id: lockdiff
        with:
          comment: false
      - if: steps.lockdiff.outputs.major != '0'
        run: echo "This PR has ${{ steps.lockdiff.outputs.major }} major dependency bumps."
```

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `token` | `${{ github.token }}` | Token for reading the pull request and posting the comment. |
| `comment` | `true` | Post and keep updating one comment on the pull request. |
| `sizes` | `true` | Look up unpacked sizes on the npm registry. |
| `max-rows` | `50` | Most rows per table before the rest are summarized. |
| `fail-on` | | Fail when a direct dependency is `major`, `downgrade`, `added` or `removed` (comma-separated). |

## Outputs

| Output | What it is |
| --- | --- |
| `changed` | `"true"` when any package was added, removed or changed version. |
| `added`, `removed`, `updated` | Counts. |
| `major` | Number of major version bumps. Before 1.0, a minor bump counts as major. |
| `size-delta` | Change in unpacked install size in bytes, for the packages that could be looked up. |
| `markdown` | The summary as Markdown. |

The summary is also written to the job summary, so it's visible even when commenting isn't possible.

## Pull requests from forks

On `pull_request` events from forks, GitHub gives the workflow a read-only token, so the action can't comment. It logs a warning and still writes the job summary. If you need comments on fork PRs, run it on `pull_request_target`; it only reads lockfiles through the API and never checks out or runs the pull request's code.

## License

MIT
