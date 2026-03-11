/**
 * Daily Pick — Achievement of the Day.
 *
 * Picks a random locked achievement from the currently loaded grid game
 * (or a specified game). The pick rotates once per calendar day.
 * Press → opens a guide for the picked achievement.
 */

import streamDeck, {
	action,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getGridController, type GridAchievement } from "../services/grid-controller";
import { getSteamApi } from "../services/steam-client-holder";
import {
	renderLockedCell,
	renderDailyPickKey,
	getRarityInfo,
} from "../services/svg-renderer";

type DailyPickSettings = {
	/** Override appId (otherwise uses grid's current game). */
	appId?: number;
	clickAction?: "youtube" | "steam";
};

@action({ UUID: "com.maxik.steam-achievements.daily-pick" })
export class DailyPick extends SingletonAction<DailyPickSettings> {
	private currentPick: GridAchievement | null = null;
	private pickDate: string | null = null; // "YYYY-MM-DD"
	private pickAppId: number | null = null;
	private disposable?: { dispose: () => void };

	override async onWillAppear(ev: WillAppearEvent<DailyPickSettings>): Promise<void> {
		await this.render(ev.action, ev.payload.settings);

		this.disposable?.dispose();
		this.disposable = streamDeck.settings.onDidReceiveGlobalSettings(() => {
			for (const a of this.actions) {
				this.render(a);
			}
		});
	}

	override async onWillDisappear(_ev: WillDisappearEvent<DailyPickSettings>): Promise<void> {
		this.disposable?.dispose();
		this.disposable = undefined;
	}

	override async onKeyDown(ev: KeyDownEvent<DailyPickSettings>): Promise<void> {
		if (!this.currentPick) {
			// Force refresh
			await this.render(ev.action, ev.payload.settings);
			return;
		}

		const grid = getGridController();
		const gameName = grid.getGameName() ?? "";
		const achName = this.currentPick.displayName;
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

	private async render(
		actionObj: { setImage: (img?: string) => Promise<void>; setTitle: (t: string) => Promise<void> },
		settings?: DailyPickSettings,
	): Promise<void> {
		const grid = getGridController();
		const appId = settings?.appId ?? grid.getAppId();

		if (!appId) {
			await actionObj.setImage(renderDailyPickKey());
			await actionObj.setTitle("No game\nloaded");
			return;
		}

		// If a game is loaded in the grid, use its data; otherwise we'd need to fetch
		const allAchievements = grid.getAppId() === appId ? grid.getAll() : [];
		const locked = [...allAchievements].filter((a) => !a.achieved);

		if (locked.length === 0) {
			await actionObj.setImage(renderDailyPickKey());
			await actionObj.setTitle(grid.getGameName() ? "100% ✓\nDone!" : "No locked\nachvs");
			this.currentPick = null;
			return;
		}

		// Pick deterministically based on the current date
		const today = new Date().toISOString().slice(0, 10);
		if (this.pickDate !== today || this.pickAppId !== appId) {
			// Seed: hash of date string for deterministic daily rotation
			const seed = this.hashString(today + appId.toString());
			const idx = seed % locked.length;
			this.currentPick = locked[idx];
			this.pickDate = today;
			this.pickAppId = appId;
		}

		const pick = this.currentPick!;
		const api = getSteamApi();
		const iconBase64 = api ? await api.fetchImageAsDataUri(pick.iconGrayUrl) : null;

		if (iconBase64) {
			await actionObj.setImage(renderLockedCell(iconBase64, pick.rarityPct));
		} else {
			await actionObj.setImage(renderDailyPickKey());
		}

		const name = pick.displayName.length > 14 ? pick.displayName.slice(0, 12) + "…" : pick.displayName;
		const { label } = getRarityInfo(pick.rarityPct);
		await actionObj.setTitle(`⭐ ${name}\n${label}`);
	}

	/** Simple string hash for deterministic daily pick. */
	private hashString(s: string): number {
		let hash = 0;
		for (let i = 0; i < s.length; i++) {
			const ch = s.charCodeAt(i);
			hash = ((hash << 5) - hash) + ch;
			hash |= 0; // Convert to 32-bit int
		}
		return Math.abs(hash);
	}
}
