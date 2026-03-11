# Contributing to Steam Achievement Hunter

Thanks for your interest in contributing! This guide will help you get started.

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

Releases are automated via GitHub Actions. To create a release:

```bash
npm run bump patch   # or minor / major
git push origin dev --follow-tags
```

This triggers the release workflow which builds, packages, and publishes a GitHub Release with the `.streamDeckPlugin` artifact.

## Questions?

Open an [issue](https://github.com/SantosMaxime/Streamdeck-Steam-Achievements/issues) — we're happy to help.
