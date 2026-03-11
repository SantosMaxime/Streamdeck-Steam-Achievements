/**
 * Unit tests for GridController singleton.
 *
 * Covers:
 *  - loadGame() — loads achievements, merges with schema and rarity, broadcasts version
 *  - getSlot(index) — returns correct achievement for current page
 *  - setPage() — clamps to valid range, broadcasts
 *  - getPageCount() — correct calculation based on filtered count and page size
 *  - setSortMode("rarest") — achievements sorted by rarity % ascending
 *  - setSortMode("alpha") — sorted alphabetically
 *  - setSortMode("locked-only") — only shows locked achievements
 *  - setSortMode("unlocked-only") — only shows unlocked achievements
 *  - getStats() — correct unlocked/total/pct
 *  - clear() — resets all state
 *  - refreshProgress() — updates achieved status without reloading schema
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks (hoisted by Vitest before imports) ───────────────────────────

vi.mock("@elgato/streamdeck", () => {
	// Stub SingletonAction so any action extending it can load
	class SingletonAction<_T> {
		onWillAppear?(_ev: unknown): Promise<void> { return Promise.resolve(); }
		onWillDisappear?(_ev: unknown): Promise<void> { return Promise.resolve(); }
		onKeyDown?(_ev: unknown): Promise<void> { return Promise.resolve(); }
		onDidReceiveSettings?(_ev: unknown): Promise<void> { return Promise.resolve(); }
	}

	return {
		default: {
			settings: {
				getGlobalSettings: vi.fn().mockResolvedValue({}),
				setGlobalSettings: vi.fn().mockResolvedValue(undefined),
			},
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		},
		// TC39 Stage-3 class decorator factory — just a no-op in tests
		action: (_opts: unknown) => (_target: unknown, _ctx: unknown) => {},
		SingletonAction,
	};
});

vi.mock("../services/steam-client-holder", () => ({
	getSteamApi: vi.fn(),
}));

// ── Imports (after mocks are registered) ─────────────────────────────────────

import streamDeck from "@elgato/streamdeck";
import { getSteamApi } from "../services/steam-client-holder";
import {
	getGridController,
	resetGridController,
	type GridAchievement,
} from "../services/grid-controller";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockGetApi = () => vi.mocked(getSteamApi);
const mockSetGlobal = () => vi.mocked(streamDeck.settings.setGlobalSettings);

/** Player achievements: 2 locked, 1 unlocked. */
const PLAYER_DATA = {
	gameName: "Half-Life",
	achievements: [
		{ apiname: "ACH_WIN",        achieved: 0, unlocktime: 0 },
		{ apiname: "ACH_SPEED",      achieved: 0, unlocktime: 0 },
		{ apiname: "ACH_HARD",       achieved: 1, unlocktime: 1_700_000_000 },
	],
};

const SCHEMA = {
	gameName: "Half-Life",
	achievements: [
		{ name: "ACH_WIN",   displayName: "Winner",     description: "Win a game.",      icon: "http://img/a.png", icongray: "http://img/a_gray.png" },
		{ name: "ACH_SPEED", displayName: "Fast Runner", description: "Finish quickly.",  icon: "http://img/b.png", icongray: "http://img/b_gray.png" },
		{ name: "ACH_HARD",  displayName: "Hard Day",    description: "Win on hard.",     icon: "http://img/c.png", icongray: "http://img/c_gray.png" },
	],
};

/** Global rarity percentages keyed by apiname. */
const RARITY = new Map<string, number>([
	["ACH_WIN",   45.2],
	["ACH_SPEED", 12.8],
	["ACH_HARD",  78.1],
]);

/** Player data after ACH_WIN becomes unlocked. */
const PLAYER_DATA_AFTER_UNLOCK = {
	gameName: "Half-Life",
	achievements: [
		{ apiname: "ACH_WIN",   achieved: 1, unlocktime: 1_700_100_000 },
		{ apiname: "ACH_SPEED", achieved: 0, unlocktime: 0 },
		{ apiname: "ACH_HARD",  achieved: 1, unlocktime: 1_700_000_000 },
	],
};

/** Build a mock SteamApiClient with sensible defaults. */
function makeMockApi(overrides: Record<string, unknown> = {}) {
	return {
		getCurrentGame:                  vi.fn().mockResolvedValue(null),
		getPlayerAchievements:           vi.fn().mockResolvedValue(null),
		getGameSchema:                   vi.fn().mockResolvedValue(null),
		getGlobalAchievementPercentages: vi.fn().mockResolvedValue(new Map()),
		fetchImageAsDataUri:             vi.fn().mockResolvedValue("data:image/png;base64,FAKE"),
		clearSummaryCache:               vi.fn(),
		...overrides,
	};
}

/** Build a fully-wired mock API for the standard game. */
function makeGameApi(overrides: Record<string, unknown> = {}) {
	return makeMockApi({
		getPlayerAchievements:           vi.fn().mockResolvedValue(PLAYER_DATA),
		getGameSchema:                   vi.fn().mockResolvedValue(SCHEMA),
		getGlobalAchievementPercentages: vi.fn().mockResolvedValue(RARITY),
		...overrides,
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GridController", () => {
	beforeEach(() => {
		resetGridController();
		mockGetApi().mockReset();
		mockSetGlobal().mockReset();
		vi.mocked(streamDeck.settings.getGlobalSettings).mockReset().mockResolvedValue({});
		vi.mocked(streamDeck.settings.setGlobalSettings).mockReset().mockResolvedValue(undefined);
	});

	// ── loadGame ─────────────────────────────────────────────────────────────

	describe("loadGame()", () => {
		it("loads achievements, merges schema and rarity, and broadcasts version", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			// Verify API calls
			expect(api.getPlayerAchievements).toHaveBeenCalledWith(70);
			expect(api.getGameSchema).toHaveBeenCalledWith(70);
			expect(api.getGlobalAchievementPercentages).toHaveBeenCalledWith(70);

			// Verify merged data
			expect(gc.getAll()).toHaveLength(3);
			const first = gc.getAll()[0];
			expect(first.apiname).toBe("ACH_WIN");
			expect(first.displayName).toBe("Winner");
			expect(first.description).toBe("Win a game.");
			expect(first.achieved).toBe(false);
			expect(first.rarityPct).toBe(45.2);
			expect(first.iconUrl).toBe("http://img/a.png");
			expect(first.iconGrayUrl).toBe("http://img/a_gray.png");

			// Verify state
			expect(gc.getAppId()).toBe(70);
			expect(gc.getGameName()).toBe("Half-Life");
			expect(gc.getPage()).toBe(0);
			expect(gc.getVersion()).toBeGreaterThan(0);

			// Verify broadcast was called (setGlobalSettings)
			expect(streamDeck.settings.setGlobalSettings).toHaveBeenCalled();
			const lastCall = mockSetGlobal().mock.calls.at(-1)![0] as Record<string, unknown>;
			expect(lastCall.gridAppId).toBe(70);
			expect(lastCall.gridGameName).toBe("Half-Life");
			expect(lastCall.gridPage).toBe(0);
			expect(lastCall.gridVersion).toBe(gc.getVersion());
		});

		it("does nothing when getSteamApi returns null", async () => {
			mockGetApi().mockReturnValue(null);

			const gc = getGridController();
			await gc.loadGame(70);

			expect(gc.getAll()).toHaveLength(0);
			expect(gc.getAppId()).toBeNull();
		});

		it("does nothing when playerData is null", async () => {
			const api = makeMockApi({
				getPlayerAchievements:           vi.fn().mockResolvedValue(null),
				getGameSchema:                   vi.fn().mockResolvedValue(SCHEMA),
				getGlobalAchievementPercentages: vi.fn().mockResolvedValue(RARITY),
			});
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			expect(gc.getAll()).toHaveLength(0);
		});

		it("does nothing when schema is null", async () => {
			const api = makeMockApi({
				getPlayerAchievements:           vi.fn().mockResolvedValue(PLAYER_DATA),
				getGameSchema:                   vi.fn().mockResolvedValue(null),
				getGlobalAchievementPercentages: vi.fn().mockResolvedValue(RARITY),
			});
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			expect(gc.getAll()).toHaveLength(0);
		});

		it("sets rarityPct to -1 when rarity data is missing for an achievement", async () => {
			const sparseRarity = new Map<string, number>([
				["ACH_WIN", 45.2],
				// ACH_SPEED and ACH_HARD missing
			]);
			const api = makeGameApi({
				getGlobalAchievementPercentages: vi.fn().mockResolvedValue(sparseRarity),
			});
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			const speed = gc.getAll().find((a) => a.apiname === "ACH_SPEED")!;
			expect(speed.rarityPct).toBe(-1);

			const hard = gc.getAll().find((a) => a.apiname === "ACH_HARD")!;
			expect(hard.rarityPct).toBe(-1);
		});
	});

	// ── getSlot ──────────────────────────────────────────────────────────────

	describe("getSlot(index)", () => {
		it("returns the correct achievement for the current page", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			gc.setPageSize(2); // 2 items per page
			await gc.loadGame(70);

			// Page 0: slots 0 and 1 map to filtered[0] and filtered[1]
			const slot0 = gc.getSlot(0)!;
			const slot1 = gc.getSlot(1)!;
			expect(slot0.apiname).toBe("ACH_WIN");
			expect(slot1.apiname).toBe("ACH_SPEED");

			// Go to page 1
			await gc.setPage(1);
			const slot0p1 = gc.getSlot(0)!;
			expect(slot0p1.apiname).toBe("ACH_HARD");
		});

		it("returns null for out-of-range slot index", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			expect(gc.getSlot(999)).toBeNull();
		});

		it("returns null when no game is loaded", () => {
			const gc = getGridController();
			expect(gc.getSlot(0)).toBeNull();
		});
	});

	// ── setPage ──────────────────────────────────────────────────────────────

	describe("setPage()", () => {
		it("clamps to valid range and broadcasts", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			gc.setPageSize(2); // 3 items / 2 per page = 2 pages (0, 1)
			await gc.loadGame(70);

			// Try setting beyond max page
			await gc.setPage(100);
			expect(gc.getPage()).toBe(1); // clamped to last page

			// Try setting below zero
			await gc.setPage(-5);
			expect(gc.getPage()).toBe(0); // clamped to 0
		});

		it("broadcasts when page actually changes", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			gc.setPageSize(2);
			await gc.loadGame(70);

			mockSetGlobal().mockClear();
			await gc.setPage(1);

			expect(streamDeck.settings.setGlobalSettings).toHaveBeenCalledTimes(1);
			const call = mockSetGlobal().mock.calls[0][0] as Record<string, unknown>;
			expect(call.gridPage).toBe(1);
		});

		it("does not broadcast when page stays the same", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			gc.setPageSize(2);
			await gc.loadGame(70);

			// Page is already 0; setting to 0 should not broadcast
			mockSetGlobal().mockClear();
			await gc.setPage(0);

			expect(streamDeck.settings.setGlobalSettings).not.toHaveBeenCalled();
		});
	});

	// ── getPageCount ─────────────────────────────────────────────────────────

	describe("getPageCount()", () => {
		it("returns correct page count based on filtered count and page size", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();

			// 3 achievements, page size 2 → ceil(3/2) = 2
			gc.setPageSize(2);
			await gc.loadGame(70);
			expect(gc.getPageCount()).toBe(2);

			// 3 achievements, page size 3 → ceil(3/3) = 1
			gc.setPageSize(3);
			expect(gc.getPageCount()).toBe(1);

			// 3 achievements, page size 1 → 3
			gc.setPageSize(1);
			expect(gc.getPageCount()).toBe(3);
		});

		it("returns 1 when no achievements are loaded", () => {
			const gc = getGridController();
			expect(gc.getPageCount()).toBe(1);
		});
	});

	// ── setSortMode("rarest") ────────────────────────────────────────────────

	describe('setSortMode("rarest")', () => {
		it("sorts achievements by rarity % ascending", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);
			await gc.setSortMode("rarest");

			const filtered = gc.getFiltered();
			// ACH_SPEED=12.8, ACH_WIN=45.2, ACH_HARD=78.1
			expect(filtered[0].apiname).toBe("ACH_SPEED");
			expect(filtered[0].rarityPct).toBe(12.8);
			expect(filtered[1].apiname).toBe("ACH_WIN");
			expect(filtered[1].rarityPct).toBe(45.2);
			expect(filtered[2].apiname).toBe("ACH_HARD");
			expect(filtered[2].rarityPct).toBe(78.1);
		});

		it("places unknown rarity (-1) at the end", async () => {
			const sparseRarity = new Map<string, number>([
				["ACH_WIN", 45.2],
				// ACH_SPEED missing → -1
				["ACH_HARD", 78.1],
			]);
			const api = makeGameApi({
				getGlobalAchievementPercentages: vi.fn().mockResolvedValue(sparseRarity),
			});
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);
			await gc.setSortMode("rarest");

			const filtered = gc.getFiltered();
			expect(filtered[0].apiname).toBe("ACH_WIN");   // 45.2
			expect(filtered[1].apiname).toBe("ACH_HARD");  // 78.1
			expect(filtered[2].apiname).toBe("ACH_SPEED"); // -1 → last
			expect(filtered[2].rarityPct).toBe(-1);
		});

		it("resets page to 0 and broadcasts", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			gc.setPageSize(2);
			await gc.loadGame(70);
			await gc.setPage(1);

			mockSetGlobal().mockClear();
			await gc.setSortMode("rarest");

			expect(gc.getPage()).toBe(0);
			expect(streamDeck.settings.setGlobalSettings).toHaveBeenCalled();
		});
	});

	// ── setSortMode("alpha") ─────────────────────────────────────────────────

	describe('setSortMode("alpha")', () => {
		it("sorts achievements alphabetically by displayName", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);
			await gc.setSortMode("alpha");

			const filtered = gc.getFiltered();
			// Fast Runner, Hard Day, Winner
			expect(filtered[0].displayName).toBe("Fast Runner");
			expect(filtered[1].displayName).toBe("Hard Day");
			expect(filtered[2].displayName).toBe("Winner");
		});
	});

	// ── setSortMode("locked-only") ───────────────────────────────────────────

	describe('setSortMode("locked-only")', () => {
		it("only shows locked achievements", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);
			await gc.setSortMode("locked-only");

			const filtered = gc.getFiltered();
			// ACH_WIN (locked) and ACH_SPEED (locked); ACH_HARD (unlocked) excluded
			expect(filtered).toHaveLength(2);
			expect(filtered.every((a) => !a.achieved)).toBe(true);
			expect(filtered[0].apiname).toBe("ACH_WIN");
			expect(filtered[1].apiname).toBe("ACH_SPEED");
		});

		it("preserves API order within the filter", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);
			await gc.setSortMode("locked-only");

			const filtered = gc.getFiltered();
			// Original order: ACH_WIN, ACH_SPEED (both locked)
			expect(filtered[0].apiname).toBe("ACH_WIN");
			expect(filtered[1].apiname).toBe("ACH_SPEED");
		});
	});

	// ── setSortMode("unlocked-only") ─────────────────────────────────────────

	describe('setSortMode("unlocked-only")', () => {
		it("only shows unlocked achievements", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);
			await gc.setSortMode("unlocked-only");

			const filtered = gc.getFiltered();
			// Only ACH_HARD is unlocked
			expect(filtered).toHaveLength(1);
			expect(filtered[0].apiname).toBe("ACH_HARD");
			expect(filtered[0].achieved).toBe(true);
		});
	});

	// ── getStats ─────────────────────────────────────────────────────────────

	describe("getStats()", () => {
		it("returns correct unlocked/total/pct", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			const stats = gc.getStats();
			// 1 unlocked out of 3 = 33%
			expect(stats.unlocked).toBe(1);
			expect(stats.total).toBe(3);
			expect(stats.pct).toBe(33);
		});

		it("returns 0% when no game is loaded", () => {
			const gc = getGridController();
			const stats = gc.getStats();
			expect(stats.unlocked).toBe(0);
			expect(stats.total).toBe(0);
			expect(stats.pct).toBe(0);
		});

		it("returns 100% when all are unlocked", async () => {
			const allUnlocked = {
				gameName: "Half-Life",
				achievements: [
					{ apiname: "ACH_WIN",   achieved: 1, unlocktime: 1 },
					{ apiname: "ACH_SPEED", achieved: 1, unlocktime: 2 },
					{ apiname: "ACH_HARD",  achieved: 1, unlocktime: 3 },
				],
			};
			const api = makeGameApi({
				getPlayerAchievements: vi.fn().mockResolvedValue(allUnlocked),
			});
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			const stats = gc.getStats();
			expect(stats.unlocked).toBe(3);
			expect(stats.total).toBe(3);
			expect(stats.pct).toBe(100);
		});
	});

	// ── clear ────────────────────────────────────────────────────────────────

	describe("clear()", () => {
		it("resets all state", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			// Confirm data is loaded
			expect(gc.getAll()).toHaveLength(3);
			expect(gc.getAppId()).toBe(70);

			await gc.clear();

			expect(gc.getAll()).toHaveLength(0);
			expect(gc.getFiltered()).toHaveLength(0);
			expect(gc.getAppId()).toBeNull();
			expect(gc.getGameName()).toBeNull();
			expect(gc.getPage()).toBe(0);
		});

		it("broadcasts after clearing", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			mockSetGlobal().mockClear();
			await gc.clear();

			expect(streamDeck.settings.setGlobalSettings).toHaveBeenCalledTimes(1);
			const call = mockSetGlobal().mock.calls[0][0] as Record<string, unknown>;
			expect(call.gridAppId).toBeNull();
			expect(call.gridGameName).toBeNull();
			expect(call.gridPage).toBe(0);
		});
	});

	// ── refreshProgress ──────────────────────────────────────────────────────

	describe("refreshProgress()", () => {
		it("updates achieved status without reloading schema", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			// Initially ACH_WIN is locked
			expect(gc.getAll().find((a) => a.apiname === "ACH_WIN")!.achieved).toBe(false);

			// Now simulate the refresh returning updated data
			api.getPlayerAchievements.mockResolvedValue(PLAYER_DATA_AFTER_UNLOCK);

			await gc.refreshProgress();

			// ACH_WIN should now be unlocked
			const win = gc.getAll().find((a) => a.apiname === "ACH_WIN")!;
			expect(win.achieved).toBe(true);
			expect(win.unlocktime).toBe(1_700_100_000);

			// Schema should NOT be re-fetched (only called once during loadGame)
			expect(api.getGameSchema).toHaveBeenCalledTimes(1);
			expect(api.getGlobalAchievementPercentages).toHaveBeenCalledTimes(1);
		});

		it("preserves existing schema data (displayName, icons, rarity)", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			api.getPlayerAchievements.mockResolvedValue(PLAYER_DATA_AFTER_UNLOCK);
			await gc.refreshProgress();

			const win = gc.getAll().find((a) => a.apiname === "ACH_WIN")!;
			expect(win.displayName).toBe("Winner");
			expect(win.iconUrl).toBe("http://img/a.png");
			expect(win.iconGrayUrl).toBe("http://img/a_gray.png");
			expect(win.rarityPct).toBe(45.2);
		});

		it("broadcasts after refreshing", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			api.getPlayerAchievements.mockResolvedValue(PLAYER_DATA_AFTER_UNLOCK);

			mockSetGlobal().mockClear();
			await gc.refreshProgress();

			expect(streamDeck.settings.setGlobalSettings).toHaveBeenCalled();
		});

		it("does nothing when no game is loaded (appId is null)", async () => {
			mockGetApi().mockReturnValue(makeGameApi());

			const gc = getGridController();
			// Never called loadGame, so appId is null

			mockSetGlobal().mockClear();
			await gc.refreshProgress();

			expect(streamDeck.settings.setGlobalSettings).not.toHaveBeenCalled();
		});

		it("does nothing when getSteamApi returns null", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);

			// Now the API disappears
			mockGetApi().mockReturnValue(null);
			mockSetGlobal().mockClear();
			await gc.refreshProgress();

			// No broadcast should have happened from refreshProgress
			expect(streamDeck.settings.setGlobalSettings).not.toHaveBeenCalled();
		});

		it("re-applies sort/filter after refresh", async () => {
			const api = makeGameApi();
			mockGetApi().mockReturnValue(api);

			const gc = getGridController();
			await gc.loadGame(70);
			await gc.setSortMode("locked-only");

			// Initially 2 locked: ACH_WIN, ACH_SPEED
			expect(gc.getFiltered()).toHaveLength(2);

			// After refresh, ACH_WIN is now unlocked
			api.getPlayerAchievements.mockResolvedValue(PLAYER_DATA_AFTER_UNLOCK);
			await gc.refreshProgress();

			// locked-only should now only show ACH_SPEED
			expect(gc.getFiltered()).toHaveLength(1);
			expect(gc.getFiltered()[0].apiname).toBe("ACH_SPEED");
		});
	});
});
