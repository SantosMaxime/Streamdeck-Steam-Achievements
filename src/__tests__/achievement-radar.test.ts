/**
 * Unit tests for AchievementRadar action.
 *
 * Covers:
 *  - No API key → alert
 *  - No game running → "No game running"
 *  - Normal display: gray icon + progress title
 *  - All achievements unlocked → "100% ✓"
 *  - Guide Button: YouTube URL (default click action)
 *  - Guide Button: Steam community URL (clickAction = "steam")
 *  - Guide Button fallback when nothing tracked → force refresh
 *  - Pop Alert: tracked achievement becomes unlocked → celebration state
 *  - Celebration uses colored icon
 *  - Celebration ends after 10 s → normal radar resumes
 *  - celebrationActive prevents overwriting during timeout
 *  - Custom refresh interval from settings
 *  - onDidReceiveSettings restarts poll timer on interval change
 *  - onWillDisappear clears poll timer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks (hoisted by Vitest before imports) ───────────────────────────

vi.mock("@elgato/streamdeck", () => {
	// Stub SingletonAction so AchievementRadar can extend it
	class SingletonAction<_T> {
		onWillAppear?(_ev: unknown): Promise<void> { return Promise.resolve(); }
		onWillDisappear?(_ev: unknown): Promise<void> { return Promise.resolve(); }
		onKeyDown?(_ev: unknown): Promise<void> { return Promise.resolve(); }
		onDidReceiveSettings?(_ev: unknown): Promise<void> { return Promise.resolve(); }
	}

	return {
		default: {
			system: { openUrl: vi.fn() },
			logger:  { error: vi.fn() },
		},
		// TC39 Stage-3 class decorator factory — just a no-op in tests
		action: (_opts: unknown) => (_target: unknown, _ctx: unknown) => {},
		SingletonAction,
		DidReceiveSettingsEvent: {},
	};
});

vi.mock("../services/steam-client-holder", () => ({
	getSteamApi: vi.fn(),
}));

// ── Imports (after mocks are registered) ─────────────────────────────────────

import streamDeck from "@elgato/streamdeck";
import { getSteamApi } from "../services/steam-client-holder";
import { AchievementRadar } from "../actions/achievement-radar";

// ── Helpers ──────────────────────────────────────────────────────────────────

type PartialSettings = {
	refreshInterval?: number;
	clickAction?: "youtube" | "steam";
};

/** Factory for a minimal fake Stream Deck action event. */
function makeEvent(settings: PartialSettings = {}) {
	return {
		action: {
			setTitle:  vi.fn().mockResolvedValue(undefined),
			setImage:  vi.fn().mockResolvedValue(undefined),
			showAlert: vi.fn().mockResolvedValue(undefined),
		},
		payload: {
			settings: {
				refreshInterval: 60,
				clickAction: "youtube" as const,
				...settings,
			},
		},
	};
}

const GAME = { appId: 70, name: "Half-Life" };

/** Player achievements with two locked and one already unlocked. */
const PLAYER_DATA_2_LOCKED = {
	gameName: "Half-Life",
	achievements: [
		{ apiname: "ACH_WIN_ONE_GAME",  achieved: 0, unlocktime: 0 },
		{ apiname: "ACH_WIN_NO_DEATHS", achieved: 0, unlocktime: 0 },
		{ apiname: "ACH_WIN_HARD",      achieved: 1, unlocktime: 1_700_000_000 },
	],
};

const SCHEMA = {
	gameName: "Half-Life",
	achievements: [
		{ name: "ACH_WIN_ONE_GAME",  displayName: "One for the team", description: "Win a game.",        icon: "http://img/a.png",  icongray: "http://img/a_gray.png" },
		{ name: "ACH_WIN_NO_DEATHS", displayName: "Untouchable",      description: "Win without dying.", icon: "http://img/b.png",  icongray: "http://img/b_gray.png" },
		{ name: "ACH_WIN_HARD",      displayName: "Hard day",         description: "Win on hard.",       icon: "http://img/c.png",  icongray: "http://img/c_gray.png" },
	],
};

/** Player data where ACH_WIN_ONE_GAME is now freshly unlocked. */
const PLAYER_DATA_UNLOCKED_FIRST = {
	gameName: "Half-Life",
	achievements: [
		{ apiname: "ACH_WIN_ONE_GAME",  achieved: 1, unlocktime: Date.now() },
		{ apiname: "ACH_WIN_NO_DEATHS", achieved: 0, unlocktime: 0 },
		{ apiname: "ACH_WIN_HARD",      achieved: 1, unlocktime: 1_700_000_000 },
	],
};

/** Build a mock SteamApiClient with sensible defaults. */
function makeMockApi(overrides: Record<string, unknown> = {}) {
	return {
		getCurrentGame:       vi.fn().mockResolvedValue(null),
		getPlayerAchievements: vi.fn().mockResolvedValue(null),
		getGameSchema:        vi.fn().mockResolvedValue(null),
		fetchImageAsDataUri:  vi.fn().mockResolvedValue("data:image/png;base64,FAKE"),
		clearSummaryCache:    vi.fn(),
		...overrides,
	};
}

/** Helper that returns a running-game API with an unlock on the 2nd fetch. */
function makeUnlockApi() {
	let call = 0;
	return makeMockApi({
		getCurrentGame:       vi.fn().mockResolvedValue(GAME),
		getGameSchema:        vi.fn().mockResolvedValue(SCHEMA),
		getPlayerAchievements: vi.fn().mockImplementation(() => {
			call++;
			return Promise.resolve(call === 1 ? PLAYER_DATA_2_LOCKED : PLAYER_DATA_UNLOCKED_FIRST);
		}),
	});
}

// ── Typed shorthand for the mocked openUrl spy ────────────────────────────────
const mockOpenUrl  = () => vi.mocked(streamDeck.system.openUrl);
const mockGetApi   = () => vi.mocked(getSteamApi);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AchievementRadar", () => {
	let radar: AchievementRadar;

	beforeEach(() => {
		vi.useFakeTimers();
		radar = new AchievementRadar();
		mockOpenUrl().mockReset();
		mockGetApi().mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── No API key ──────────────────────────────────────────────────────────────

	describe("when no API key is configured", () => {
		it("shows alert and 'No API Key' title", async () => {
			mockGetApi().mockReturnValue(null);
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);

			expect(ev.action.showAlert).toHaveBeenCalledOnce();
			expect(ev.action.setTitle).toHaveBeenCalledWith("No API\nKey");
		});
	});

	// ── No game running ─────────────────────────────────────────────────────────

	describe("when no game is running", () => {
		it("shows 'No game running' and clears image", async () => {
			mockGetApi().mockReturnValue(makeMockApi());
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);

			expect(ev.action.setTitle).toHaveBeenCalledWith("No game\nrunning");
			expect(ev.action.setImage).toHaveBeenCalledWith(undefined);
		});
	});

	// ── Normal display ──────────────────────────────────────────────────────────

	describe("normal display", () => {
		it("shows first locked achievement name and progress fraction", async () => {
			mockGetApi().mockReturnValue(makeMockApi({
				getCurrentGame:       vi.fn().mockResolvedValue(GAME),
				getPlayerAchievements: vi.fn().mockResolvedValue(PLAYER_DATA_2_LOCKED),
				getGameSchema:        vi.fn().mockResolvedValue(SCHEMA),
			}));
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);

			// 1 unlocked / 3 total = 33 %; first locked = "One for the team"
			expect(ev.action.setTitle).toHaveBeenLastCalledWith("One for the team\n1/3 (33%)");
		});

		it("fetches and shows the gray (locked) icon", async () => {
			const api = makeMockApi({
				getCurrentGame:       vi.fn().mockResolvedValue(GAME),
				getPlayerAchievements: vi.fn().mockResolvedValue(PLAYER_DATA_2_LOCKED),
				getGameSchema:        vi.fn().mockResolvedValue(SCHEMA),
			});
			mockGetApi().mockReturnValue(api);
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);

			expect(api.fetchImageAsDataUri).toHaveBeenCalledWith("http://img/a_gray.png");
			expect(ev.action.setImage).toHaveBeenCalledWith("data:image/png;base64,FAKE");
		});

		it("truncates achievement names longer than 18 chars", async () => {
			const longName = "A Very Long Achievement Name";
			mockGetApi().mockReturnValue(makeMockApi({
				getCurrentGame: vi.fn().mockResolvedValue(GAME),
				getPlayerAchievements: vi.fn().mockResolvedValue({
					gameName: "Half-Life",
					achievements: [{ apiname: "ACH_LONG", achieved: 0, unlocktime: 0 }],
				}),
				getGameSchema: vi.fn().mockResolvedValue({
					gameName: "Half-Life",
					achievements: [
						{ name: "ACH_LONG", displayName: longName, description: "", icon: "x.png", icongray: "xg.png" },
					],
				}),
			}));
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);

			const title: string = ev.action.setTitle.mock.calls.at(-1)![0];
			// slice(0, 16) = "A Very Long Achi" (16 chars) + "…"
			expect(title.split("\n")[0]).toBe("A Very Long Achi…");
		});
	});

	// ── All achievements unlocked ───────────────────────────────────────────────

	describe("when all achievements are unlocked", () => {
		it("shows 100% completion", async () => {
			mockGetApi().mockReturnValue(makeMockApi({
				getCurrentGame: vi.fn().mockResolvedValue(GAME),
				getPlayerAchievements: vi.fn().mockResolvedValue({
					gameName: "Half-Life",
					achievements: [
						{ apiname: "ACH_A", achieved: 1, unlocktime: 1 },
						{ apiname: "ACH_B", achieved: 1, unlocktime: 2 },
					],
				}),
				getGameSchema: vi.fn().mockResolvedValue({
					gameName: "Half-Life",
					achievements: [
						{ name: "ACH_A", displayName: "A", description: "", icon: "a.png", icongray: "ag.png" },
						{ name: "ACH_B", displayName: "B", description: "", icon: "b.png", icongray: "bg.png" },
					],
				}),
			}));
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);

			expect(ev.action.setTitle).toHaveBeenLastCalledWith("Half-Life\n100% ✓");
		});
	});

	// ── Guide Button ────────────────────────────────────────────────────────────

	describe("Guide Button (onKeyDown)", () => {
		it("opens a YouTube guide search URL by default", async () => {
			mockGetApi().mockReturnValue(makeMockApi({
				getCurrentGame:       vi.fn().mockResolvedValue(GAME),
				getPlayerAchievements: vi.fn().mockResolvedValue(PLAYER_DATA_2_LOCKED),
				getGameSchema:        vi.fn().mockResolvedValue(SCHEMA),
			}));

			const appearEv = makeEvent();
			await radar.onWillAppear(appearEv as never);

			const keyEv = makeEvent({ clickAction: "youtube" });
			await radar.onKeyDown(keyEv as never);

			expect(mockOpenUrl()).toHaveBeenCalledWith(
				"https://www.youtube.com/results?search_query=Half-Life%20One%20for%20the%20team%20achievement%20guide",
			);
			expect(keyEv.action.showAlert).not.toHaveBeenCalled();
		});

		it("opens a Steam community guide URL when clickAction is 'steam'", async () => {
			mockGetApi().mockReturnValue(makeMockApi({
				getCurrentGame:       vi.fn().mockResolvedValue(GAME),
				getPlayerAchievements: vi.fn().mockResolvedValue(PLAYER_DATA_2_LOCKED),
				getGameSchema:        vi.fn().mockResolvedValue(SCHEMA),
			}));

			const appearEv = makeEvent();
			await radar.onWillAppear(appearEv as never);

			const keyEv = makeEvent({ clickAction: "steam" });
			await radar.onKeyDown(keyEv as never);

			expect(mockOpenUrl()).toHaveBeenCalledWith(
				"https://steamcommunity.com/app/70/guides/?searchText=One%20for%20the%20team",
			);
		});

		it("falls back to force-refresh when no achievement is tracked", async () => {
			mockGetApi().mockReturnValue(null);
			const ev = makeEvent();

			await radar.onKeyDown(ev as never);

			expect(mockOpenUrl()).not.toHaveBeenCalled();
			expect(ev.action.showAlert).toHaveBeenCalled();
			expect(ev.action.setTitle).toHaveBeenCalledWith("No API\nKey");
		});
	});

	// ── Settings: refresh interval ─────────────────────────────────────────────

	describe("refresh interval from settings", () => {
		it("polls at the interval specified in settings", async () => {
			const api = makeMockApi({ getCurrentGame: vi.fn().mockResolvedValue(null) });
			mockGetApi().mockReturnValue(api);
			const ev = makeEvent({ refreshInterval: 30 }); // 30 s

			await radar.onWillAppear(ev as never);
			const callsAfterAppear = (api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length;

			// Advance 30 s — should fire one tick at the custom interval
			await vi.advanceTimersByTimeAsync(30_000);
			expect((api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterAppear + 1);

			// Advance another 30 s — second tick
			await vi.advanceTimersByTimeAsync(30_000);
			expect((api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterAppear + 2);
		});

		it("falls back to 60 s when refreshInterval is missing", async () => {
			const api = makeMockApi({ getCurrentGame: vi.fn().mockResolvedValue(null) });
			mockGetApi().mockReturnValue(api);
			const ev = makeEvent({ refreshInterval: undefined });

			await radar.onWillAppear(ev as never);
			const callsAfterAppear = (api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length;

			// 30 s — too early, shouldn't fire
			await vi.advanceTimersByTimeAsync(30_000);
			expect((api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterAppear);

			// 60 s from start — fires
			await vi.advanceTimersByTimeAsync(30_000);
			expect((api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterAppear + 1);
		});

		it("restarts the timer when onDidReceiveSettings is called with a new interval", async () => {
			const api = makeMockApi({ getCurrentGame: vi.fn().mockResolvedValue(null) });
			mockGetApi().mockReturnValue(api);
			const ev = makeEvent({ refreshInterval: 60 });

			await radar.onWillAppear(ev as never);
			const callsAfterAppear = (api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length;

			// Change interval to 20 s via PI settings update
			await radar.onDidReceiveSettings!(makeEvent({ refreshInterval: 20 }) as never);

			// Advance 20 s — new timer should fire
			await vi.advanceTimersByTimeAsync(20_000);
			expect((api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterAppear + 1);
		});
	});

	// ── Pop Alert ───────────────────────────────────────────────────────────────

	describe("Pop Alert (achievement unlock detection)", () => {
		it("shows DÉBLOQUÉ 🏆 celebration title when tracked achievement is unlocked", async () => {
			mockGetApi().mockReturnValue(makeUnlockApi());
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);     // call 1: locked
			await vi.advanceTimersByTimeAsync(60_000); // call 2: ACH_WIN_ONE_GAME unlocked

			const lastTitle: string = ev.action.setTitle.mock.calls.at(-1)![0];
			expect(lastTitle).toContain("DÉBLOQUÉ 🏆");
		});

		it("uses the colored (unlocked) icon during celebration", async () => {
			const api = makeUnlockApi();
			mockGetApi().mockReturnValue(api);
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);
			await vi.advanceTimersByTimeAsync(60_000);

			// Colored icon URL for ACH_WIN_ONE_GAME is "http://img/a.png"
			expect(api.fetchImageAsDataUri).toHaveBeenCalledWith("http://img/a.png");
		});

		it("does not overwrite celebration display during the 10 s window", async () => {
			mockGetApi().mockReturnValue(makeUnlockApi());
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);
			await vi.advanceTimersByTimeAsync(60_000); // unlock detected → celebration

			const setTitleCallsAfterCelebration = ev.action.setTitle.mock.calls.length;

			// Advance 8 s — still inside the 10 s celebration; no interval fires yet
			await vi.advanceTimersByTimeAsync(8_000);

			// setTitle must NOT have been called again (celebrationActive guard)
			expect(ev.action.setTitle.mock.calls.length).toBe(setTitleCallsAfterCelebration);
		});

		it("resumes normal radar after the 10 s celebration timeout", async () => {
			mockGetApi().mockReturnValue(makeUnlockApi());
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);
			await vi.advanceTimersByTimeAsync(60_000); // unlock detected → celebration
			await vi.advanceTimersByTimeAsync(10_000); // celebration ends → normal refresh

			// Now "Untouchable" is the first locked achievement (ACH_WIN_ONE_GAME is done)
			const lastTitle: string = ev.action.setTitle.mock.calls.at(-1)![0];
			expect(lastTitle).toContain("Untouchable");
		});
	});

	// ── Lifecycle cleanup ────────────────────────────────────────────────────────

	describe("onWillDisappear", () => {
		it("stops polling after disappear", async () => {
			const api = makeMockApi({ getCurrentGame: vi.fn().mockResolvedValue(null) });
			mockGetApi().mockReturnValue(api);
			const ev = makeEvent();

			await radar.onWillAppear(ev as never);
			await radar.onWillDisappear({} as never);

			const callsBefore = (api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length;
			await vi.advanceTimersByTimeAsync(60_000 * 5);

			expect((api.getCurrentGame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
		});
	});
});
