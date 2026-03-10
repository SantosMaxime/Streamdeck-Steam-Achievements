/**
 * Achievement Radar Simulator
 *
 * Sequences through every radar scenario and prints what the Stream Deck key
 * would show, without needing a real device or a Steam connection.
 *
 * Run:  npm run simulate
 */

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const C = {
	reset:  "\x1b[0m",
	bold:   "\x1b[1m",
	dim:    "\x1b[2m",
	cyan:   "\x1b[36m",
	green:  "\x1b[32m",
	yellow: "\x1b[33m",
	red:    "\x1b[31m",
	magenta:"\x1b[35m",
	blue:   "\x1b[34m",
	gray:   "\x1b[90m",
};

// ── Fake data ─────────────────────────────────────────────────────────────────

interface AchievementInfo {
	apiname: string;
	displayName: string;
	iconUrl: string;
	iconGrayUrl: string;
	achieved: boolean;
}

const GAME_NAME = "Hollow Knight";
const ACHIEVEMENTS: AchievementInfo[] = [
	{ apiname: "ACH_HORNET",    displayName: "Hornet",          iconUrl: "🟡", iconGrayUrl: "⬜", achieved: true  },
	{ apiname: "ACH_MANTIS",    displayName: "Mantis Lords",    iconUrl: "🟠", iconGrayUrl: "⬜", achieved: true  },
	{ apiname: "ACH_PANTHEON",  displayName: "Pantheon Ascent", iconUrl: "🟣", iconGrayUrl: "⬜", achieved: false },
	{ apiname: "ACH_NIGHTMARE", displayName: "Into the Nightmare", iconUrl: "🔴", iconGrayUrl: "⬜", achieved: false },
	{ apiname: "ACH_RADIANSE",  displayName: "Embrace the Void",   iconUrl: "⬛", iconGrayUrl: "⬜", achieved: false },
];

// ── Stream Deck key renderer ──────────────────────────────────────────────────

/** Simulate what a Stream Deck key looks like in the terminal. */
function renderKey(title: string, icon: string, alert = false): void {
	const lines = title.split("\n");
	const width = 30;
	const top    = "┌" + "─".repeat(width) + "┐";
	const bottom = "└" + "─".repeat(width) + "┘";
	const fill   = (s: string) => {
		const padded = s.length > width ? s.slice(0, width - 1) + "…" : s;
		return "│" + padded.padEnd(width) + "│";
	};

	console.log(C.gray + top + C.reset);
	if (alert) {
		console.log(C.gray + fill("") + C.reset);
		console.log(C.gray + "│" + C.reset + C.red + C.bold + " ⚠  ALERT ".padEnd(width) + C.reset + C.gray + "│" + C.reset);
		console.log(C.gray + fill("") + C.reset);
	} else {
		console.log(C.gray + fill("") + C.reset);
		console.log(C.gray + "│" + C.reset + `  ${icon}  ` + C.dim + "(icon)".padEnd(width - 5) + C.reset + C.gray + "│" + C.reset);
		console.log(C.gray + fill("") + C.reset);
		for (const line of lines) {
			console.log(C.gray + fill("  " + line) + C.reset);
		}
	}
	console.log(C.gray + bottom + C.reset);
}

function header(title: string): void {
	console.log("\n" + C.cyan + C.bold + `── ${title} ` + "─".repeat(Math.max(0, 52 - title.length)) + C.reset);
}

function note(msg: string): void {
	console.log(C.dim + "  " + msg + C.reset);
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

// ── Radar display logic (mirrors achievement-radar.ts) ────────────────────────

function buildTitle(displayName: string, unlockedCount: number, total: number): string {
	const pct = Math.round((unlockedCount / total) * 100);
	const name = displayName.length > 18 ? displayName.slice(0, 16) + "…" : displayName;
	return `${name}\n${unlockedCount}/${total} (${pct}%)`;
}

function guideUrl(gameName: string, achievementName: string): string {
	return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${gameName} ${achievementName} achievement guide`)}`;
}

// ── Simulation ────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
	console.log(C.bold + C.yellow + "\n╔══════════════════════════════════════╗");
	console.log(             "║   Achievement Radar Simulator        ║");
	console.log(             "╚══════════════════════════════════════╝" + C.reset);

	// ── 1. No API key ─────────────────────────────────────────────────────────
	header("Scenario 1 — No API key configured");
	note("getSteamApi() returns null → alert + fallback title");
	renderKey("No API\nKey", "—", true);
	await sleep(600);

	// ── 2. API key set, no game running ───────────────────────────────────────
	header("Scenario 2 — API key set, but no Steam game is running");
	note("getCurrentGame() returns null");
	renderKey("No game\nrunning", "—");
	await sleep(600);

	// ── 3. Game started, show first locked achievement ────────────────────────
	header("Scenario 3 — Game running: " + GAME_NAME);
	const locked = ACHIEVEMENTS.filter((a) => !a.achieved);
	const total  = ACHIEVEMENTS.length;
	const unlocked = total - locked.length;

	const target = locked[0];
	const title3 = buildTitle(target.displayName, unlocked, total);
	note(`Detected game: ${GAME_NAME} (appId: 44200)`);
	note(`Achievements: ${unlocked}/${total} unlocked`);
	note(`Tracking: "${target.displayName}"`);
	renderKey(title3, target.iconGrayUrl);
	await sleep(600);

	// ── 4. Guide Button pressed ───────────────────────────────────────────────
	header("Scenario 4 — User presses the key (Guide Button)");
	const url = guideUrl(GAME_NAME, target.displayName);
	note("openUrl() is called → browser opens:");
	console.log("  " + C.blue + url + C.reset);
	note("Key display is unchanged (no refresh on key press)");
	renderKey(title3, target.iconGrayUrl);
	await sleep(600);

	// ── 5. Pop Alert: first locked achievement just unlocked ──────────────────
	header("Scenario 5 — Pop Alert: \"" + target.displayName + "\" just unlocked!");
	note(`Radar detected: trackedApiname="${target.apiname}" is now achieved=1`);
	note("Showing 10 s celebration state…");

	const celebName = target.displayName.length > 14
		? target.displayName.slice(0, 12) + "…"
		: target.displayName;
	renderKey(`${celebName}\nDÉBLOQUÉ 🏆`, target.iconUrl);
	await sleep(600);

	// ── 6. After 10 s: celebration ends, back to normal ──────────────────────
	header("Scenario 6 — 10 s later: celebration ends, radar resumes");
	// Mutate to simulate unlock
	const updated = ACHIEVEMENTS.map((a) =>
		a.apiname === target.apiname ? { ...a, achieved: true } : a,
	);
	const locked2   = updated.filter((a) => !a.achieved);
	const unlocked2 = updated.length - locked2.length;

	if (locked2.length === 0) {
		renderKey(`${GAME_NAME}\n100% ✓`, "✨");
	} else {
		const next = locked2[0];
		note(`New target: "${next.displayName}"`);
		renderKey(buildTitle(next.displayName, unlocked2, updated.length), next.iconGrayUrl);
	}
	await sleep(600);

	// ── 7. All achievements unlocked ──────────────────────────────────────────
	header("Scenario 7 — All achievements unlocked (100%)");
	note("No more locked achievements to track");
	renderKey(`${GAME_NAME}\n100% ✓`, "✨");
	await sleep(600);

	// ── Summary ───────────────────────────────────────────────────────────────
	console.log("\n" + C.green + C.bold + "✔  All scenarios completed." + C.reset);
	console.log(C.dim + "  Run `npm test` for the full automated unit-test suite.\n" + C.reset);
}

run().catch((err) => {
	console.error(C.red + "Simulator error:" + C.reset, err);
	process.exit(1);
});
