/**
 * Centralized grid state manager.
 *
 * Holds either a game's achievement data (achievements mode) or a list of
 * owned games (games mode). All grid cell actions read from this singleton
 * and re-render whenever `broadcast()` bumps the version counter.
 *
 * Mode transitions:
 *   browseGames()  →  mode = "games"       (grid shows game tiles)
 *   loadGame()     →  mode = "achievements" (grid shows achievement tiles)
 */

import streamDeck from "@elgato/streamdeck";
import { getSteamApi } from "./steam-client-holder";

export type SortMode = "default" | "rarest" | "alpha" | "locked-only" | "unlocked-only";
export type GridMode = "achievements" | "games";

export interface GridAchievement {
	apiname: string;
	displayName: string;
	description: string;
	achieved: boolean;
	unlocktime: number;
	iconUrl: string;
	iconGrayUrl: string;
	/** Global unlock percentage (0-100). -1 if unknown. */
	rarityPct: number;
}

export interface OwnedGame {
	appid: number;
	name: string;
}

export interface GridState {
	gridAppId: number | null;
	gridGameName: string | null;
	gridPage: number;
	gridVersion: number;
	gridSortMode: SortMode;
	gridMode: GridMode;
}

class GridController {
	private achievements: GridAchievement[] = [];
	private filtered: GridAchievement[] = [];
	private games: OwnedGame[] = [];
	private mode: GridMode = "achievements";
	private appId: number | null = null;
	private gameName: string | null = null;
	private page = 0;
	private version = 0;
	private sortMode: SortMode = "default";
	private pageSize = 12;

	// ── Achievements mode ────────────────────────────────────

	/** Load a game's achievements into the grid (switches to achievements mode). */
	async loadGame(appId: number): Promise<void> {
		streamDeck.logger.info(`GridController.loadGame: start appId=${appId}`);
		const api = getSteamApi();
		if (!api) {
			streamDeck.logger.warn("GridController.loadGame: no SteamApi available");
			return;
		}

		let playerData, schema, rarity;
		try {
			[playerData, schema, rarity] = await Promise.all([
				api.getPlayerAchievements(appId),
				api.getGameSchema(appId),
				api.getGlobalAchievementPercentages(appId),
			]);
		} catch (err) {
			streamDeck.logger.error(`GridController.loadGame: API fetch failed — ${String(err)}`);
			throw err;
		}

		if (!playerData || !schema) {
			streamDeck.logger.warn(`GridController.loadGame: incomplete data, aborting`);
			return;
		}

		const schemaMap = new Map(schema.achievements.map((s) => [s.name, s]));

		this.achievements = playerData.achievements.map((a) => {
			const s = schemaMap.get(a.apiname);
			return {
				apiname: a.apiname,
				displayName: s?.displayName ?? a.apiname,
				description: s?.description ?? "",
				achieved: a.achieved === 1,
				unlocktime: a.unlocktime,
				iconUrl: s?.icon ?? "",
				iconGrayUrl: s?.icongray ?? "",
				rarityPct: rarity.get(a.apiname) ?? -1,
			};
		});

		this.appId = appId;
		this.gameName = playerData.gameName;
		this.mode = "achievements";
		this.page = 0;
		this.applySort();
		streamDeck.logger.info(`GridController.loadGame: loaded "${this.gameName}" — ${this.achievements.length} achievements`);
		await this.broadcast();
	}

	/** Refresh achievement progress without reloading schema/rarity. */
	async refreshProgress(): Promise<void> {
		if (!this.appId) return;
		const api = getSteamApi();
		if (!api) return;

		const fresh = await api.getPlayerAchievements(this.appId);
		if (!fresh) return;

		const progressMap = new Map(fresh.achievements.map((a) => [a.apiname, a]));
		for (const entry of this.achievements) {
			const p = progressMap.get(entry.apiname);
			if (p) {
				entry.achieved = p.achieved === 1;
				entry.unlocktime = p.unlocktime;
			}
		}

		this.applySort();
		await this.broadcast();
	}

	// ── Games mode ───────────────────────────────────────────

	/** Load owned games into the grid (switches to games mode). */
	async browseGames(games: OwnedGame[]): Promise<void> {
		this.games = games;
		this.mode = "games";
		this.page = 0;
		streamDeck.logger.info(`GridController.browseGames: ${games.length} games`);
		await this.broadcast();
	}

	/** Get the game at a given slot index on the current page (games mode). */
	getGameSlot(slotIndex: number): OwnedGame | null {
		return this.games[this.page * this.pageSize + slotIndex] ?? null;
	}

	// ── Shared getters ───────────────────────────────────────

	getMode(): GridMode { return this.mode; }

	/** Get the achievement for a given slot index on the current page (achievements mode). */
	getSlot(slotIndex: number): GridAchievement | null {
		return this.filtered[this.page * this.pageSize + slotIndex] ?? null;
	}

	getFiltered(): readonly GridAchievement[] { return this.filtered; }
	getAll(): readonly GridAchievement[] { return this.achievements; }
	getAppId(): number | null { return this.appId; }
	getGameName(): string | null { return this.gameName; }
	getPage(): number { return this.page; }
	getVersion(): number { return this.version; }
	getSortMode(): SortMode { return this.sortMode; }
	getPageSize(): number { return this.pageSize; }

	setPageSize(n: number): void {
		if (n > 0) this.pageSize = n;
	}

	getPageCount(): number {
		const count = this.mode === "games" ? this.games.length : this.filtered.length;
		return Math.max(1, Math.ceil(count / this.pageSize));
	}

	async setPage(n: number): Promise<void> {
		const clamped = Math.max(0, Math.min(n, this.getPageCount() - 1));
		if (clamped !== this.page) {
			this.page = clamped;
			await this.broadcast();
		}
	}

	async setSortMode(mode: SortMode): Promise<void> {
		if (mode !== this.sortMode) {
			this.sortMode = mode;
			this.page = 0;
			this.applySort();
			await this.broadcast();
		}
	}

	async clear(): Promise<void> {
		this.achievements = [];
		this.filtered = [];
		this.games = [];
		this.mode = "achievements";
		this.appId = null;
		this.gameName = null;
		this.page = 0;
		await this.broadcast();
	}

	getStats(): { unlocked: number; total: number; pct: number } {
		const total = this.achievements.length;
		const unlocked = this.achievements.filter((a) => a.achieved).length;
		const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
		return { unlocked, total, pct };
	}

	// ── Internal ─────────────────────────────────────────────

	private applySort(): void {
		let list = [...this.achievements];

		if (this.sortMode === "locked-only") {
			list = list.filter((a) => !a.achieved);
		} else if (this.sortMode === "unlocked-only") {
			list = list.filter((a) => a.achieved);
		}

		if (this.sortMode === "rarest") {
			list.sort((a, b) => {
				const ra = a.rarityPct < 0 ? 999 : a.rarityPct;
				const rb = b.rarityPct < 0 ? 999 : b.rarityPct;
				return ra - rb;
			});
		} else if (this.sortMode === "alpha") {
			list.sort((a, b) => a.displayName.localeCompare(b.displayName));
		}

		this.filtered = list;
	}

	private async broadcast(): Promise<void> {
		this.version++;
		streamDeck.logger.info(`GridController.broadcast: v=${this.version} mode=${this.mode} page=${this.page}`);
		try {
			const current = await streamDeck.settings.getGlobalSettings() as Record<string, unknown>;
			await streamDeck.settings.setGlobalSettings({
				...current,
				gridAppId: this.appId,
				gridGameName: this.gameName,
				gridPage: this.page,
				gridVersion: this.version,
				gridSortMode: this.sortMode,
				gridMode: this.mode,
			});
		} catch (err) {
			streamDeck.logger.error(`GridController.broadcast: failed — ${String(err)}`);
		}
	}
}

// ── Singleton ────────────────────────────────────────────

let instance: GridController | null = null;

export function getGridController(): GridController {
	if (!instance) instance = new GridController();
	return instance;
}

/** For testing only. */
export function resetGridController(): void {
	instance = null;
}
