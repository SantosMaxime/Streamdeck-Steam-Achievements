import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { getSteamApi } from "../services/steam-client-holder";

type DashboardSettings = {
	apiKey?: string;
	steamId?: string;
};

/**
 * Dashboard: Steam Level
 * Displays the player's current Steam level on the key.
 */
@action({ UUID: "com.maxik.steam-achievements.dashboard-level" })
export class DashboardLevel extends SingletonAction<DashboardSettings> {
	private refreshTimer?: ReturnType<typeof setInterval>;

	override async onWillAppear(ev: WillAppearEvent<DashboardSettings>): Promise<void> {
		await this.updateKey(ev);
		this.refreshTimer = setInterval(() => this.updateKey(ev), 5 * 60 * 1000);
	}

	override async onWillDisappear(): Promise<void> {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	override async onKeyDown(ev: KeyDownEvent<DashboardSettings>): Promise<void> {
		getSteamApi()?.clearCache();
		await this.updateKey(ev);
	}

	private async updateKey(ev: WillAppearEvent<DashboardSettings> | KeyDownEvent<DashboardSettings>): Promise<void> {
		const api = getSteamApi();
		if (!api) {
			await ev.action.showAlert();
			await ev.action.setTitle("No API\nKey");
			return;
		}

		try {
			const level = await api.getPlayerLevel();
			await ev.action.setTitle(`LVL\n${level}`);
		} catch (err) {
			streamDeck.logger.error("DashboardLevel: failed to fetch level", err);
			await ev.action.showAlert();
			await ev.action.setTitle("Error");
		}
	}
}

/**
 * Dashboard: Total Achievements
 * Displays the total number of unlocked achievements across all games.
 */
@action({ UUID: "com.maxik.steam-achievements.dashboard-total" })
export class DashboardTotal extends SingletonAction<DashboardSettings> {
	private refreshTimer?: ReturnType<typeof setInterval>;

	override async onWillAppear(ev: WillAppearEvent<DashboardSettings>): Promise<void> {
		await this.updateKey(ev);
		this.refreshTimer = setInterval(() => this.updateKey(ev), 10 * 60 * 1000);
	}

	override async onWillDisappear(): Promise<void> {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	override async onKeyDown(ev: KeyDownEvent<DashboardSettings>): Promise<void> {
		getSteamApi()?.clearCache();
		await ev.action.setTitle("...");
		await this.updateKey(ev);
	}

	private async updateKey(ev: WillAppearEvent<DashboardSettings> | KeyDownEvent<DashboardSettings>): Promise<void> {
		const api = getSteamApi();
		if (!api) {
			await ev.action.showAlert();
			await ev.action.setTitle("No API\nKey");
			return;
		}

		try {
			const stats = await api.getGlobalStats();
			await ev.action.setTitle(`🏆\n${stats.totalAchievements}`);
		} catch (err) {
			streamDeck.logger.error("DashboardTotal: failed to fetch stats", err);
			await ev.action.showAlert();
			await ev.action.setTitle("Error");
		}
	}
}

/**
 * Dashboard: Perfect Games
 * Displays the number of games completed at 100%.
 */
@action({ UUID: "com.maxik.steam-achievements.dashboard-perfect" })
export class DashboardPerfect extends SingletonAction<DashboardSettings> {
	private refreshTimer?: ReturnType<typeof setInterval>;

	override async onWillAppear(ev: WillAppearEvent<DashboardSettings>): Promise<void> {
		await this.updateKey(ev);
		this.refreshTimer = setInterval(() => this.updateKey(ev), 10 * 60 * 1000);
	}

	override async onWillDisappear(): Promise<void> {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	override async onKeyDown(ev: KeyDownEvent<DashboardSettings>): Promise<void> {
		getSteamApi()?.clearCache();
		await ev.action.setTitle("...");
		await this.updateKey(ev);
	}

	private async updateKey(ev: WillAppearEvent<DashboardSettings> | KeyDownEvent<DashboardSettings>): Promise<void> {
		const api = getSteamApi();
		if (!api) {
			await ev.action.showAlert();
			await ev.action.setTitle("No API\nKey");
			return;
		}

		try {
			const stats = await api.getGlobalStats();
			await ev.action.setTitle(`💯\n${stats.perfectGames}/${stats.totalGamesWithAchievements}`);
		} catch (err) {
			streamDeck.logger.error("DashboardPerfect: failed to fetch stats", err);
			await ev.action.showAlert();
			await ev.action.setTitle("Error");
		}
	}
}
