/**
 * Grid Cell — a single achievement slot on the Stream Deck.
 *
 * Each physical key holds its own per-action CellState (slot index, current
 * achievement, celebration timer). This avoids the duplication bug that occurs
 * when a singleton shares a single `mySlot` value across all key instances.
 *
 * Slot index is stored in the action's bundled settings (set by the profile
 * manifest). If unset — e.g. when a user manually adds a new grid cell —
 * the slot is auto-calculated from the key's physical position on the deck
 * and saved back so it persists.
 *
 * Press → opens a YouTube or Steam guide for the displayed achievement.
 */

import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getGridController, type GridAchievement } from "../services/grid-controller";
import { getSteamApi } from "../services/steam-client-holder";
import { DEVICE_PROFILE } from "../services/device-profiles";
import {
	renderLockedCell,
	renderUnlockedCell,
	renderCelebrationCell,
	renderEmptyCell,
	renderGameCell,
} from "../services/svg-renderer";

type GridCellSettings = {
	/** Slot index (0-indexed, set in the bundled profile manifest). */
	slotIndex?: number;
	clickAction?: "youtube" | "steam";
};

interface CellState {
	slotIndex: number;
	achievement: GridAchievement | null;
	celebrationTimer?: ReturnType<typeof setInterval>;
	celebrationFrame: 0 | 1;
	celebrationIconBase64: string | null;
}

type ActionLike = {
	id: string;
	setImage: (img?: string) => Promise<void>;
	setTitle: (t: string) => Promise<void>;
};

@action({ UUID: "com.maxik.steam-achievements.grid-cell" })
export class GridCell extends SingletonAction<GridCellSettings> {
	/** Per-action state: keyed by action.id so every key has independent state. */
	private cells = new Map<string, CellState>();
	/** Last rendered grid version so we only re-render when data actually changed. */
	private lastVersion = -1;
	/** Single subscription for all grid cells on this device. */
	private globalSettingsDisposable?: { dispose: () => void };

	override async onWillAppear(ev: WillAppearEvent<GridCellSettings>): Promise<void> {
		let slot = ev.payload.settings.slotIndex;

		// If slotIndex is not set (e.g. user manually added a new grid cell),
		// calculate it from the physical key position on the deck.
		if (slot === undefined || slot === null) {
			const coords = "coordinates" in ev.payload ? ev.payload.coordinates : undefined;
			const deviceType = ev.action.device.type as number;
			const cols = DEVICE_PROFILE[deviceType]?.cols ?? 5;
			slot = coords ? coords.row * cols + coords.column : 0;
			// Persist the calculated value so it sticks
			await ev.action.setSettings({ ...ev.payload.settings, slotIndex: slot });
		}

		this.cells.set(ev.action.id, {
			slotIndex: slot ?? 0,
			achievement: null,
			celebrationFrame: 0,
			celebrationIconBase64: null,
		});

		// Set up the global-settings subscription once (shared across all cells).
		if (!this.globalSettingsDisposable) {
			this.globalSettingsDisposable = streamDeck.settings.onDidReceiveGlobalSettings((gsEv) => {
				const gs = gsEv.settings as Record<string, unknown>;
				const version = gs.gridVersion as number | undefined;
				if (version !== undefined && version !== this.lastVersion) {
					this.lastVersion = version;
					for (const a of this.actions) {
						const state = this.cells.get(a.id);
						if (state) void this.renderActionSlot(a, state);
					}
				}
			});
		}

		await this.renderActionSlot(ev.action, this.cells.get(ev.action.id)!);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<GridCellSettings>): Promise<void> {
		const state = this.cells.get(ev.action.id);
		if (!state) return;

		const newSlot = ev.payload.settings.slotIndex ?? 0;
		if (newSlot !== state.slotIndex) {
			state.slotIndex = newSlot;
			await this.renderActionSlot(ev.action, state);
		}
	}

	override async onWillDisappear(ev: WillDisappearEvent<GridCellSettings>): Promise<void> {
		const state = this.cells.get(ev.action.id);
		if (state) {
			this.stopCelebration(state);
			this.cells.delete(ev.action.id);
		}

		// Tear down subscription when no cells remain visible.
		if (this.cells.size === 0) {
			this.globalSettingsDisposable?.dispose();
			this.globalSettingsDisposable = undefined;
			this.lastVersion = -1;
		}
	}

	override async onKeyDown(ev: KeyDownEvent<GridCellSettings>): Promise<void> {
		const state = this.cells.get(ev.action.id);
		if (!state) return;

		const grid = getGridController();

		if (grid.getMode() === "games") {
			const game = grid.getGameSlot(state.slotIndex);
			if (!game) return;
			try {
				await grid.loadGame(game.appid);
			} catch {
				await ev.action.showAlert();
			}
			return;
		}

		if (!state.achievement) return;

		const gameName = grid.getGameName() ?? "";
		const achName = state.achievement.displayName;
		const clickAction = ev.payload.settings.clickAction ?? "youtube";

		if (clickAction === "steam" && grid.getAppId()) {
			const query = encodeURIComponent(achName);
			await streamDeck.system.openUrl(
				`https://steamcommunity.com/app/${grid.getAppId()}/guides/?searchText=${query}`,
			);
		} else {
			const query = encodeURIComponent(`${gameName} ${achName} achievement guide`);
			await streamDeck.system.openUrl(
				`https://www.youtube.com/results?search_query=${query}`,
			);
		}
	}

	// ── Rendering ───────────────────────────────────────────

	private async renderActionSlot(actionObj: ActionLike, state: CellState): Promise<void> {
		const grid = getGridController();

		if (grid.getMode() === "games") {
			const game = grid.getGameSlot(state.slotIndex);
			if (!game) {
				await actionObj.setImage(renderEmptyCell());
				await actionObj.setTitle("");
				return;
			}
			const api = getSteamApi();
			const imgUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`;
			const imageDataUri = api ? await api.fetchImageAsDataUri(imgUrl) : null;
			await actionObj.setImage(renderGameCell(game.name, imageDataUri));
			await actionObj.setTitle("");
			return;
		}

		const achievement = grid.getSlot(state.slotIndex);

		if (!achievement) {
			state.achievement = null;
			this.stopCelebration(state);
			await actionObj.setImage(renderEmptyCell());
			await actionObj.setTitle("");
			return;
		}

		// Detect unlock transition (locked → unlocked for the same achievement).
		if (
			state.achievement &&
			!state.achievement.achieved &&
			achievement.achieved &&
			state.achievement.apiname === achievement.apiname
		) {
			await this.startCelebration(actionObj, state, achievement);
			return;
		}

		state.achievement = achievement;

		const api = getSteamApi();
		const iconUrl = achievement.achieved ? achievement.iconUrl : achievement.iconGrayUrl;
		const iconBase64 = api ? await api.fetchImageAsDataUri(iconUrl) : null;
		const iconSrc = iconBase64 ?? "";

		if (achievement.achieved) {
			await actionObj.setImage(renderUnlockedCell(iconSrc, achievement.rarityPct));
		} else {
			await actionObj.setImage(renderLockedCell(iconSrc, achievement.rarityPct));
		}
		await actionObj.setTitle("");
	}

	private async startCelebration(
		actionObj: ActionLike,
		state: CellState,
		achievement: GridAchievement,
	): Promise<void> {
		state.achievement = achievement;
		this.stopCelebration(state);

		const api = getSteamApi();
		state.celebrationIconBase64 = api ? await api.fetchImageAsDataUri(achievement.iconUrl) : null;

		state.celebrationFrame = 0;
		await actionObj.setImage(renderCelebrationCell(state.celebrationIconBase64 ?? "", 0));
		await actionObj.setTitle("");

		let ticks = 0;
		state.celebrationTimer = setInterval(async () => {
			ticks++;
			state.celebrationFrame = (state.celebrationFrame === 0 ? 1 : 0) as 0 | 1;
			await actionObj.setImage(renderCelebrationCell(state.celebrationIconBase64 ?? "", state.celebrationFrame));

			if (ticks >= 10) {
				this.stopCelebration(state);
				await actionObj.setImage(renderUnlockedCell(state.celebrationIconBase64 ?? "", achievement.rarityPct));
			}
		}, 500);
	}

	private stopCelebration(state: CellState): void {
		if (state.celebrationTimer) {
			clearInterval(state.celebrationTimer);
			state.celebrationTimer = undefined;
		}
	}
}
