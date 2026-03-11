# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-03-11

### Added
- Comprehensive `README.md` with badges, Mermaid architecture diagram, feature table, rarity chart, project structure tree, and Stream Deck CLI commands reference
- `CONTRIBUTING.md` documenting branch strategy, Conventional Commits workflow, first-time setup, and full release flow
- GitHub Actions **CI workflow** (`ci.yml`): type-check, test, and build on every push to `dev` and PRs targeting `main`
- GitHub Actions **release workflow** (`release.yml`): triggers on `release:` commit merging to `main` — creates git tag, builds, packages, and publishes GitHub Release with `.streamDeckPlugin` artifact automatically
- Automated version bump script (`npm run bump patch|minor|major`): syncs `package.json` and `manifest.json`, inserts `CHANGELOG.md` entry, creates release commit on `dev` — tag is created by CI on `main` after PR merge
- One-shot branch protection workflow (`setup-branch-protection.yml`): applies full `main` protection rules via GitHub API using a PAT secret
- `CODEOWNERS` assigning `@SantosMaxime` as default reviewer on all PRs
- GitHub issue templates for bug reports and feature requests
- Pull request template with merge checklist
- `.editorconfig` for consistent cross-editor formatting (tabs, UTF-8, final newlines)
- MIT License

### Changed
- `.gitignore` trimmed from 147 lines of boilerplate to 41 focused lines; `*.streamDeckPlugin` is now excluded from version control
- CI workflow triggers scoped to: push on `dev` only, PRs targeting `main` only
- `dev` established as the default working branch; `main` is protected and accepts PRs only

### Fixed
- `bump-version.mjs` push hint corrected and tag creation removed — git tags are now created by CI on `main`, never pushed manually from `dev`
- `package.json` and `manifest.json` versions re-synced to `0.1.1` / `0.1.1.0`
- `.streamDeckPlugin` distributable removed from repository (now produced exclusively by the CI release workflow)

## [0.1.1] - 2025-05-20

### Added
- Auto profiles for all Stream Deck device types (Standard, Mini, XL, Plus/Neo)
- Auto refresh display on game detection
- Enhanced UI/UX for all actions

### Fixed
- Auto slot assignment issues
- Display refresh timing

## [0.1.0] - 2025-05-18

### Added
- Initial release of Steam Achievement Hunter
- Achievement Radar with configurable refresh interval and click actions
- Achievement Grid with multi-key gallery and pagination
- Game Browser with auto-detect and profile switching
- Dashboard actions: Steam Level, Total Achievements, Perfect Games
- Daily Pick with deterministic daily random selection
- Grid Info with progress ring and sort mode cycling (Default, Rarest, Alphabetical, Locked Only, Unlocked Only)
- Rarity color system: Legendary, Ultra Rare, Rare, Uncommon, Common
- 10-second golden celebration animation on achievement unlock
- Custom SVG renderer for all key displays
- Custom PNG icon generator (pure Node.js software rasterizer)
- Profile generator for Standard, Mini, XL, and Plus device types
- Terminal-based radar simulator for development
