/**
 * Centralized grid state manager.
 *
 * Holds the current game's merged achievement data (progress + schema + rarity),
 * pagination state, sort/filter mode. All grid cell actions read from this
 * singleton so they stay in sync.
 *
 * Communication: when state changes, `broadcast()` writes a version counter
 * to Stream Deck global settings. Every grid action watches
 * `onDidReceiveGlobalSettings` and re-renders when the version bumps.
 */

import streamDeck from "@elgato/streamdeck";
import { getSteamApi } from "./steam-client-holder";

export type SortMode = "default" | "rarest" | "alpha" | "locked-only" | "unlocked-only";

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

export interface GridState {
	gridAppId: number | null;
	gridGameName: string | null;
	gridPage: number;
	gridVersion: number;
	gridSortMode: SortMode;
}

class GridController {
	private achievements: GridAchievement[] = [];
	private filtered: GridAchievement[] = [];
	private appId: number | null = null;
	private gameName: string | null = null;
	private page = 0;
	private version = 0;
	private sortMode: SortMode = "default";

	/** Load a game's achievements + rarity data into the grid. */
	async loadGame(appId: number): Promise<void> {
		streamDeck.logger.info(`GridController.loadGame: start appId=${appId}`);
		const api = getSteamApi();
		if (!api) {
			streamDeck.logger.warn("GridController.loadGame: no SteamApi available (missing apiKey or steamId?)");
			return;
		}

		let playerData, schema, rarity;
		try {
			[playerData, schema, rarity] = await Promise.all([
				api.getPlayerAchievements(appId),
				api.getGameSchema(appId),
				api.getGlobalAchievementPercentages(appId),
			]);
			streamDeck.logger.info(
				`GridController.loadGame: API results — ` +
				`playerData=${playerData ? `${playerData.achievements.length} achievements` : "null"} ` +
				`schema=${schema ? `${schema.achievements.length} entries` : "null"} ` +
				`rarity=${rarity.size} entries`
			);
		} catch (err) {
			streamDeck.logger.error(`GridController.loadGame: API fetch failed — ${String(err)}`);
			throw err;
		}

		if (!playerData || !schema) {
			streamDeck.logger.warn(`GridController.loadGame: incomplete data (playerData=${!!playerData} schema=${!!schema}), aborting`);
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
		this.page = 0;
		this.applySort();
		streamDeck.logger.info(`GridController.loadGame: loaded "${this.gameName}" — ${this.achievements.length} achievements, pageSize=${this.pageSize}`);
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

	/** Get the achievement for a given slot index on the current page. */
	getSlot(slotIndex: number): GridAchievement | null {
		const idx = this.page * this.getPageSize() + slotIndex;
		return this.filtered[idx] ?? null;
	}

	/** Get all filtered achievements (for computing page count externally). */
	getFiltered(): readonly GridAchievement[] {
		return this.filtered;
	}

	/** Get all achievements (unfiltered). */
	getAll(): readonly GridAchievement[] {
		return this.achievements;
	}

	getAppId(): number | null {
		return this.appId;
	}

	getGameName(): string | null {
		return this.gameName;
	}

	getPage(): number {
		return this.page;
	}

	getVersion(): number {
		return this.version;
	}

	getSortMode(): SortMode {
		return this.sortMode;
	}

	/** Default page size — will be overridden by actual grid cell count. */
	private pageSize = 12;

	getPageSize(): number {
		return this.pageSize;
	}

	setPageSize(n: number): void {
		if (n > 0) this.pageSize = n;
	}

	getPageCount(): number {
		return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
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

	/** Clear all state (e.g. when no game is running). */
	async clear(): Promise<void> {
		this.achievements = [];
		this.filtered = [];
		this.appId = null;
		this.gameName = null;
		this.page = 0;
		await this.broadcast();
	}

	/** Returns progress stats for the current game. */
	getStats(): { unlocked: number; total: number; pct: number } {
		const total = this.achievements.length;
		const unlocked = this.achievements.filter((a) => a.achieved).length;
		const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
		return { unlocked, total, pct };
	}

	// ── Internal ─────────────────────────────────────────────

	private applySort(): void {
		let list = [...this.achievements];

		// Filter
		if (this.sortMode === "locked-only") {
			list = list.filter((a) => !a.achieved);
		} else if (this.sortMode === "unlocked-only") {
			list = list.filter((a) => a.achieved);
		}

		// Sort
		if (this.sortMode === "rarest") {
			list.sort((a, b) => {
				// Unknown rarity (-1) goes last
				const ra = a.rarityPct < 0 ? 999 : a.rarityPct;
				const rb = b.rarityPct < 0 ? 999 : b.rarityPct;
				return ra - rb;
			});
		} else if (this.sortMode === "alpha") {
			list.sort((a, b) => a.displayName.localeCompare(b.displayName));
		}
		// "default" keeps the API order; "locked-only"/"unlocked-only" keep API order within the filter

		this.filtered = list;
	}

	private async broadcast(): Promise<void> {
		this.version++;
		streamDeck.logger.info(`GridController.broadcast: version=${this.version} appId=${this.appId} game="${this.gameName}" page=${this.page} sortMode=${this.sortMode} filteredCount=${this.filtered.length}`);
		try {
			const current = await streamDeck.settings.getGlobalSettings() as Record<string, unknown>;
			await streamDeck.settings.setGlobalSettings({
				...current,
				gridAppId: this.appId,
				gridGameName: this.gameName,
				gridPage: this.page,
				gridVersion: this.version,
				gridSortMode: this.sortMode,
			});
			streamDeck.logger.info("GridController.broadcast: global settings written OK");
		} catch (err) {
			streamDeck.logger.error(`GridController.broadcast: failed to write global settings — ${String(err)}`);
		}
	}
}

// ── Singleton ────────────────────────────────────────────

let instance: GridController | null = null;

export function getGridController(): GridController {
	if (!instance) {
		instance = new GridController();
	}
	return instance;
}

/** For testing only. */
export function resetGridController(): void {
	instance = null;
}
