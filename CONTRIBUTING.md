# Contributing to Steam Achievement Hunter

Thanks for your interest in contributing! This guide will help you get started.

## Branch Strategy

| Branch | Purpose | Direct push? |
|--------|---------|-------------|
| `main` | Stable, released code | **No** — PR only |
| `dev` | Integration branch, daily work | Yes |
| `feat/*` | Feature branches | Yes (PR to `dev`) |
| `fix/*` | Bug-fix branches | Yes (PR to `dev`) |

**Rules on `main`:**
- All merges require a Pull Request from `dev`
- CI must pass (type-check + tests + build) before merge
- No force-pushes, no deletion

### First-time repo setup

After cloning and pushing to GitHub for the first time, run the branch protection workflow **once**:

1. Go to **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `GH_PAT`, Value: a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope
3. Go to **Actions → Setup Branch Protection → Run workflow**

This locks `main` via the GitHub API. You only need to do this once.

---

## Development Workflow

1. **Fork** the repository and clone your fork
2. **Create a branch** from `dev` for your changes:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feat/your-feature
   ```
3. **Install dependencies**: `npm install`
4. **Make your changes** with tests
5. **Verify** everything works:
   ```bash
   npm test        # Run test suite
   npm run build   # Ensure Rollup bundles correctly
   ```
6. **Commit** using [Conventional Commits](#commit-messages)
7. **Push** and open a Pull Request against `dev`

## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/) to enable automated changelogs and clear history.

```
<type>(<scope>): <short description>

[optional body]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or action |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI/CD workflow changes |
| `chore` | Maintenance tasks |

### Examples

```
feat(radar): add auto-load grid option when game detected
fix(grid-cell): prevent celebration animation stacking
docs: update README with architecture diagram
test(grid-controller): add sorting edge case tests
build: upgrade rollup to v4.35
```

## Code Style

- **TypeScript** with strict mode — avoid `any` types
- **ESM** modules (`import`/`export`, not `require`)
- **Vitest** for tests — place test files in `src/__tests__/`
- Use `@elgato/streamdeck` SDK v2 patterns (decorators, `SingletonAction`)
- Keep SVG renderers in `src/services/svg-renderer.ts`
- Keep Steam API calls in `src/services/steam-api.ts`

## Project Layout

| Directory | Purpose |
|-----------|---------|
| `src/actions/` | Stream Deck action classes (one file per action group) |
| `src/services/` | Shared services (API client, grid state, SVG rendering) |
| `src/__tests__/` | Vitest test files |
| `src/simulator/` | Terminal-based radar simulator |
| `scripts/` | Build-time scripts (icon gen, profile gen, version bump) |
| `com.maxik.steam-achievements.sdPlugin/` | The plugin bundle (manifest, UI, images) |

## Testing

Run the full test suite:

```bash
npm test              # Single run
npm run test:watch    # Watch mode
```

When adding a new action or service, add corresponding tests in `src/__tests__/`. Mock the `@elgato/streamdeck` module as shown in existing test files.

## Releasing

Releases use a **bump on `dev` → PR → merge to `main`** flow. The git tag and GitHub Release are created automatically by CI once the PR lands on `main` — tags are never pushed manually.

```bash
# 1. On dev — bump version (creates a release commit, no tag)
npm run bump patch   # or minor / major

# 2. Fill in the blank CHANGELOG.md entry for the new version
git add CHANGELOG.md
git commit --amend --no-edit

# 3. Push dev
git push origin dev

# 4. Open a PR: dev → main on GitHub
# CI runs automatically on the PR (type-check + test + build)

# 5. Merge the PR once CI is green
# The release workflow detects the "release:" commit on main and:
#   → creates the git tag on main
#   → builds, packages, creates GitHub Release with .streamDeckPlugin
```

The `.streamDeckPlugin` artifact is **never committed** — it's always produced by CI and attached to the GitHub Release automatically.

## Questions?

Open an [issue](https://github.com/SantosMaxime/Streamdeck-Steam-Achievements/issues) — we're happy to help.
