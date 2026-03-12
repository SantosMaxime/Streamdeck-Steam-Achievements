# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-03-12

### Added
- **Settings action**: configure Steam API key and Steam ID once — all actions share the credentials via global settings; press to test the connection
- **Profile Launcher action**: one-press jump to the achievement grid profile; auto-detects device type or accepts a custom profile name
- **Grid games mode**: Grid: Info & Config now toggles between achievements view and a full-grid game browser; game tiles show Steam images (logo, capsule, header, library) with per-type fallback chains
- **Game tile image selector**: dropdown in Grid: Info & Config PI (global) to choose preferred Steam CDN image type for the games grid
- **Cell click action selector**: moved to Grid: Info & Config PI as a global setting — one dropdown controls all grid cells

### Changed
- **Grid: Info → Grid: Info & Config**: renamed to reflect its expanded role as the central config hub for the grid
- **Grid: Cell PI** simplified — Slot Index only; click action and image settings removed (now global via Grid: Info & Config)
- **Game Browser → Load Game**: renamed since the action now reloads/refreshes the currently browsed game rather than opening a picker
- **Each grid action now has its own PI** (grid-cell, grid-info, grid-prev, grid-next, game-browser) instead of a shared one
- **SVG key displays redesigned** to match Elgato's native aesthetic — custom dark backgrounds removed; achievement cells show icon + bottom rarity color strip; nav buttons use clean white stroke chevrons; utility keys (Load Game, Daily Pick) show icon only with no text labels; celebration shows pulsing gold border without UNLOCKED overlay text
- **Bundled profile templates** updated for all 4 device types: back button now uses `com.elgato.streamdeck.profile.rotate` (Elgato's native "Changer de profil" action) with an unconfigured target — users set their main profile once in the PI

### Fixed
- **Grid: Back removed** — replaced by Elgato's built-in Switch Profile action; the custom `grid-back` action and its PI are deleted
- `gen-profiles.mjs` was generating `com.elgato.streamdeck.profile.switcher` (unrecognised UUID); corrected to `com.elgato.streamdeck.profile.rotate`
- `generate-icons.ts` now auto-creates output directories via `mkdirSync` so `npm run package` no longer fails when `imgs/actions/settings/` or `imgs/actions/profile-launcher/` don't exist yet
- Grid cell slot index is auto-calculated from physical key coordinates when not set, and written back to settings so it persists
- Game browser click handler fixed by moving the game picker element outside `<sdpi-item>` to avoid event propagation issues

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

## [0.1.1] - 2026-03-11

### Added
- Auto profiles for all Stream Deck device types (Standard, Mini, XL, Plus/Neo)
- Auto refresh display on game detection
- Enhanced UI/UX for all actions

### Fixed
- Auto slot assignment issues
- Display refresh timing

## [0.1.0] - 2026-03-11

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
