import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getSteamApi } from "../services/steam-client-holder";
import type { Achievement, AchievementSchema } from "../services/steam-api";

type RadarSettings = {
	refreshInterval?: number;               // seconds (default 60, min 10, max 600)
	clickAction?: "youtube" | "steam";      // default "youtube"
};

const DEFAULT_INTERVAL = 60;

/** Merged view of a single achievement: player progress + schema metadata. */
interface AchievementInfo {
	apiname: string;
	displayName: string;
	description: string;
	achieved: boolean;
	unlocktime: number;
	iconUrl: string;      // colored icon (unlocked)
	iconGrayUrl: string;  // gray icon (locked)
}

/**
 * Achievement Radar
 *
 * Detects the currently running Steam game via GetPlayerSummaries (gameid field).
 * Fetches the game's achievements and schema, then displays the first locked
 * achievement on the Stream Deck key with its icon and name.
 *
 * Polls at a configurable interval (default 60 s).
 * Press the key → opens a YouTube or Steam community guide for the displayed achievement.
 * Detects newly unlocked achievements and shows a 10 s celebration animation.
 */
@action({ UUID: "com.maxik.steam-achievements.achievement-radar" })
export class AchievementRadar extends SingletonAction<RadarSettings> {
	private pollTimer?: ReturnType<typeof setInterval>;
	private lastAppId: number | null = null;
	/** Cache of merged achievement data per appId to avoid re-fetching schema constantly. */
	private achievementCache: Map<number, AchievementInfo[]> = new Map();

	// ── Pop Alert / Guide state ─────────────────────────────────
	/** apiname of the locked achievement currently displayed on the key. */
	private trackedApiname: string | null = null;
	/** Display name of the tracked achievement (for guide URL). */
	private trackedDisplayName: string | null = null;
	/** Name of the currently running game (for guide URL). */
	private currentGameName: string | null = null;
	/** When true a celebration is being shown — skip normal refresh display. */
	private celebrationActive = false;
	private celebrationTimeout?: ReturnType<typeof setTimeout>;

	// ── Stored settings ─────────────────────────────────────────
	private refreshIntervalSec = DEFAULT_INTERVAL;

	/** Keep a reference to the last appear event so we can restart the timer
	 *  when settings change from the Property Inspector. */
	private appearEvent?: WillAppearEvent<RadarSettings>;

	// ── SDK lifecycle ────────────────────────────────────────────

	override async onWillAppear(ev: WillAppearEvent<RadarSettings>): Promise<void> {
		this.appearEvent = ev;
		this.applySettings(ev.payload.settings);
		await this.refresh(ev);
		this.startPollTimer(ev);
	}

	override async onWillDisappear(_ev: WillDisappearEvent<RadarSettings>): Promise<void> {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
		if (this.celebrationTimeout) {
			clearTimeout(this.celebrationTimeout);
			this.celebrationTimeout = undefined;
		}
		this.appearEvent = undefined;
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RadarSettings>): Promise<void> {
		const oldInterval = this.refreshIntervalSec;
		this.applySettings(ev.payload.settings);

		// Restart the poll timer if the interval changed
		if (oldInterval !== this.refreshIntervalSec && this.appearEvent) {
			this.startPollTimer(this.appearEvent);
		}
	}

	/**
	 * Guide Button: open a YouTube or Steam community guide for the tracked achievement.
	 */
	override async onKeyDown(ev: KeyDownEvent<RadarSettings>): Promise<void> {
		if (!this.currentGameName || !this.trackedDisplayName) {
			// Nothing to search — force a refresh instead
			await this.refresh(ev);
			return;
		}

		const clickAction = ev.payload.settings.clickAction ?? "youtube";

		if (clickAction === "steam" && this.lastAppId) {
			const query = encodeURIComponent(this.trackedDisplayName);
			const url = `https://steamcommunity.com/app/${this.lastAppId}/guides/?searchText=${query}`;
			await streamDeck.system.openUrl(url);
		} else {
			const query = encodeURIComponent(
				`${this.currentGameName} ${this.trackedDisplayName} achievement guide`,
			);
			const url = `https://www.youtube.com/results?search_query=${query}`;
			await streamDeck.system.openUrl(url);
		}
	}

	// ── Settings helpers ─────────────────────────────────────────

	private applySettings(settings: RadarSettings): void {
		const raw = Number(settings.refreshInterval);
		this.refreshIntervalSec = (raw >= 10 && raw <= 600) ? raw : DEFAULT_INTERVAL;
	}

	private startPollTimer(ev: WillAppearEvent<RadarSettings>): void {
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.pollTimer = setInterval(() => this.refresh(ev), this.refreshIntervalSec * 1000);
	}

	// ── Core logic ───────────────────────────────────────────────

	private async refresh(ev: WillAppearEvent<RadarSettings> | KeyDownEvent<RadarSettings>): Promise<void> {
		// Don't overwrite the celebration display
		if (this.celebrationActive) return;

		const api = getSteamApi();
		if (!api) {
			await ev.action.showAlert();
			await ev.action.setTitle("No API\nKey");
			return;
		}

		try {
			// Step 1: detect current game
			const game = await api.getCurrentGame();
			if (!game) {
				this.lastAppId = null;
				this.trackedApiname = null;
				this.trackedDisplayName = null;
				this.currentGameName = null;
				await ev.action.setTitle("No game\nrunning");
				await ev.action.setImage(undefined);
				return;
			}

			this.currentGameName = game.name;

			// Step 2: get achievements (merged with schema)
			const achievements = await this.getMergedAchievements(game.appId);
			if (!achievements || achievements.length === 0) {
				this.trackedApiname = null;
				this.trackedDisplayName = null;
				await ev.action.setTitle(`${game.name}\nNo achievs`);
				await ev.action.setImage(undefined);
				return;
			}

			// ── Pop Alert detection ─────────────────────────────
			// If we were tracking a locked achievement and it is now unlocked → celebrate!
			if (this.trackedApiname) {
				const prev = achievements.find((a) => a.apiname === this.trackedApiname);
				if (prev && prev.achieved) {
					await this.showCelebration(ev, prev);
					// After celebration ends the next tick will resume normal display
					return;
				}
			}

			// Step 3: filter locked achievements
			const locked = achievements.filter((a) => !a.achieved);
			if (locked.length === 0) {
				// All achievements unlocked — perfect game!
				this.trackedApiname = null;
				this.trackedDisplayName = null;
				await ev.action.setTitle(`${game.name}\n100% ✓`);
				await ev.action.setImage(undefined);
				return;
			}

			// Step 4: pick the first locked achievement and display it
			const target = locked[0];
			const unlocked = achievements.length - locked.length;
			const total = achievements.length;
			const pct = Math.round((unlocked / total) * 100);

			// Update tracked state for Guide Button + Pop Alert
			this.trackedApiname = target.apiname;
			this.trackedDisplayName = target.displayName;

			// Set the achievement's gray icon as the key image
			const imageData = await api.fetchImageAsDataUri(target.iconGrayUrl);
			if (imageData) {
				await ev.action.setImage(imageData);
			}

			// Title: achievement name + progress fraction
			const name = target.displayName.length > 18
				? target.displayName.slice(0, 16) + "…"
				: target.displayName;
			await ev.action.setTitle(`${name}\n${unlocked}/${total} (${pct}%)`);

			this.lastAppId = game.appId;
		} catch (err) {
			streamDeck.logger.error("AchievementRadar: refresh failed", err);
			await ev.action.showAlert();
			await ev.action.setTitle("Error");
		}
	}

	/**
	 * Show a 10-second celebration when an achievement is newly unlocked.
	 */
	private async showCelebration(
		ev: WillAppearEvent<RadarSettings> | KeyDownEvent<RadarSettings>,
		achievement: AchievementInfo,
	): Promise<void> {
		this.celebrationActive = true;

		const api = getSteamApi();
		// Show the colored (unlocked) icon
		if (api) {
			const imageData = await api.fetchImageAsDataUri(achievement.iconUrl);
			if (imageData) {
				await ev.action.setImage(imageData);
			}
		}

		const name = achievement.displayName.length > 14
			? achievement.displayName.slice(0, 12) + "…"
			: achievement.displayName;
		await ev.action.setTitle(`${name}\nDÉBLOQUÉ 🏆`);

		// Clear previous tracked achievement so the next refresh picks a new target
		this.trackedApiname = null;
		this.trackedDisplayName = null;

		// Resume normal radar after 10 seconds
		this.celebrationTimeout = setTimeout(async () => {
			this.celebrationActive = false;
			this.celebrationTimeout = undefined;
			await this.refresh(ev);
		}, 10_000);
	}

	/**
	 * Fetch player achievements + game schema and merge them into a single list.
	 * Results are cached per appId until the user presses the key or the game changes.
	 */
	private async getMergedAchievements(appId: number): Promise<AchievementInfo[] | null> {
		// Return cached if same game and data exists
		if (this.achievementCache.has(appId)) {
			// Re-fetch player progress only (lightweight) to update achieved status
			const api = getSteamApi()!;
			const fresh = await api.getPlayerAchievements(appId);
			if (!fresh) return this.achievementCache.get(appId) ?? null;

			const cached = this.achievementCache.get(appId)!;
			const progressMap = new Map(fresh.achievements.map((a) => [a.apiname, a]));
			for (const entry of cached) {
				const p = progressMap.get(entry.apiname);
				if (p) {
					entry.achieved = p.achieved === 1;
					entry.unlocktime = p.unlocktime;
				}
			}
			return cached;
		}

		const api = getSteamApi()!;
		const [playerData, schema] = await Promise.all([
			api.getPlayerAchievements(appId),
			api.getGameSchema(appId),
		]);

		if (!playerData || !schema) return null;

		// Build a lookup from schema
		const schemaMap = new Map<string, AchievementSchema>(
			schema.achievements.map((s) => [s.name, s]),
		);

		const merged: AchievementInfo[] = playerData.achievements.map((a: Achievement) => {
			const s = schemaMap.get(a.apiname);
			return {
				apiname: a.apiname,
				displayName: s?.displayName ?? a.apiname,
				description: s?.description ?? "",
				achieved: a.achieved === 1,
				unlocktime: a.unlocktime,
				iconUrl: s?.icon ?? "",
				iconGrayUrl: s?.icongray ?? "",
			};
		});

		this.achievementCache.set(appId, merged);
		return merged;
	}
}
