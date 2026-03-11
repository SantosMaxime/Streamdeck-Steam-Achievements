/**
 * Version bump script for Steam Achievement Hunter.
 *
 * Keeps package.json (semver 3-part) and manifest.json (4-part) in sync.
 * Creates a release commit on dev — the git tag is created by CI once
 * the PR is merged to main.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch   # 0.1.1 → 0.1.2
 *   node scripts/bump-version.mjs minor   # 0.1.2 → 0.2.0
 *   node scripts/bump-version.mjs major   # 0.2.0 → 1.0.0
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Parse arguments ──────────────────────────────────────────

const level = process.argv[2];
if (!["patch", "minor", "major"].includes(level)) {
	console.error("Usage: node scripts/bump-version.mjs <patch|minor|major>");
	process.exit(1);
}

// ── Read current version from package.json ───────────────────

const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

// ── Compute new version ──────────────────────────────────────

let newMajor = major, newMinor = minor, newPatch = patch;
if (level === "major") { newMajor++; newMinor = 0; newPatch = 0; }
else if (level === "minor") { newMinor++; newPatch = 0; }
else { newPatch++; }

const semver = `${newMajor}.${newMinor}.${newPatch}`;
const fourPart = `${newMajor}.${newMinor}.${newPatch}.0`;

console.log(`Bumping: ${pkg.version} → ${semver}`);

// ── Update package.json ──────────────────────────────────────

pkg.version = semver;
writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
console.log(`  ✔ package.json → ${semver}`);

// ── Update manifest.json ─────────────────────────────────────

const manifestPath = resolve(root, "com.maxik.steam-achievements.sdPlugin", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.Version = fourPart;
writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");
console.log(`  ✔ manifest.json → ${fourPart}`);

// ── Update CHANGELOG.md ─────────────────────────────────────

const changelogPath = resolve(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const today = new Date().toISOString().slice(0, 10);
const newEntry = `## [${semver}] - ${today}\n\n### Added\n\n### Changed\n\n### Fixed\n\n`;

// Insert after the header line
const insertPoint = changelog.indexOf("\n## [");
if (insertPoint !== -1) {
	const updated = changelog.slice(0, insertPoint) + "\n" + newEntry + changelog.slice(insertPoint);
	writeFileSync(changelogPath, updated);
} else {
	// Append before end
	writeFileSync(changelogPath, changelog + "\n" + newEntry);
}
console.log(`  ✔ CHANGELOG.md → added [${semver}] entry`);

// ── Git commit ───────────────────────────────────────────────
// Note: no tag is created here — the release workflow creates the tag
// on main after the PR is merged, ensuring releases are always from main.

execSync(`git add package.json "com.maxik.steam-achievements.sdPlugin/manifest.json" CHANGELOG.md`, { cwd: root, stdio: "inherit" });
execSync(`git commit -m "release: v${semver}"`, { cwd: root, stdio: "inherit" });

console.log(`\n✔ Committed v${semver}`);
console.log(`  Next steps:`);
console.log(`    1. Fill in CHANGELOG.md for [${semver}]`);
console.log(`    2. git add CHANGELOG.md && git commit --amend --no-edit`);
console.log(`    3. git push origin dev`);
console.log(`    4. Open PR: dev → main`);
console.log(`    5. Merge PR → CI creates the tag and publishes the release automatically`);
