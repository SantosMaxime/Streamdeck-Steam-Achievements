/**
 * Game Browser — select a game to load into the achievement grid.
 *
 * When pressed:
 *  1. Loads the selected (or currently running) game's achievements into the GridController.
 *  2. Sets the GridController's page size to match the device layout.
 *  3. Auto-switches to the bundled grid profile for the detected device type,
 *     unless a custom profile name is specified in settings.
 *
 * The PI can request the owned games list by sending { type: "requestGames" } via
 * sendToPlugin. The plugin responds with { type: "games", games: [...] } via
 * sendToPropertyInspector.
 *
 * Bundled profiles (registered in manifest.json):
 *   profiles/grid-standard  →  Stream Deck Standard (5×3, 10 cells)
 *   profiles/grid-mini      →  Stream Deck Mini (3×2, 3 cells)
 *   profiles/grid-xl        →  Stream Deck XL (8×4, 24 cells)
 *   profiles/grid-plus      →  Stream Deck + / Neo (4×2, 4 cells)
 */

import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { getGridController } from "../services/grid-controller";
import { getSteamApi } from "../services/steam-client-holder";
import { renderGameBrowserKey } from "../services/svg-renderer";

type GameBrowserSettings = {
	/** Selected game appId (set from PI). Leave empty to auto-detect the running game. */
	appId?: number;
	/**
	 * Custom profile name override. When set, switches to this profile instead of
	 * the auto-detected bundled one. Must match the Name in manifest.json exactly.
	 */
	profileName?: string;
	/** When false, disables automatic profile switching entirely. Default: true. */
	autoSwitchProfile?: boolean;
};

// ── Device → bundled profile mapping ──────────────────────

/**
 * Maps a Stream Deck device type to the bundled profile name and number of
 * grid cell slots visible on one page.
 */
const DEVICE_PROFILE: Record<number, { profile: string; pageSize: number }> = {
	0: { profile: "profiles/grid-standard", pageSize: 10 },  // Standard 5×3
	1: { profile: "profiles/grid-mini",     pageSize: 3  },  // Mini 3×2
	2: { profile: "profiles/grid-xl",       pageSize: 24 },  // XL 8×4
	7: { profile: "profiles/grid-plus",     pageSize: 4  },  // Stream Deck +
	9: { profile: "profiles/grid-plus",     pageSize: 4  },  // Neo 4×2
};

@action({ UUID: "com.maxik.steam-achievements.game-browser" })
export class GameBrowser extends SingletonAction<GameBrowserSettings> {
	private selectedAppId: number | null = null;
	private gameName: string | null = null;

	override async onWillAppear(ev: WillAppearEvent<GameBrowserSettings>): Promise<void> {
		const appId = ev.payload.settings.appId;
		this.selectedAppId = appId && appId > 0 ? appId : null;
		await ev.action.setImage(renderGameBrowserKey());

		if (this.selectedAppId) {
			await this.resolveGameName(ev.action);
		} else {
			await ev.action.setTitle("Load\ngame");
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<GameBrowserSettings>): Promise<void> {
		const appId = ev.payload.settings.appId;
		this.selectedAppId = appId && appId > 0 ? appId : null;

		for (const a of this.actions) {
			if (this.selectedAppId) {
				await this.resolveGameName(a);
			} else {
				await a.setTitle("Load\ngame");
			}
		}
	}

	/** PI sent us a message — currently only "requestGames" is handled. */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, GameBrowserSettings>): Promise<void> {
		const msg = ev.payload as Record<string, unknown>;
		const type = typeof msg === "object" && msg !== null ? String(msg["type"] ?? "") : "";
		streamDeck.logger.info(`GameBrowser.onSendToPlugin: received type="${type}"`);

		if (type === "requestGames") {
			await this.sendGamesToPI();
		}
	}

	override async onKeyDown(ev: KeyDownEvent<GameBrowserSettings>): Promise<void> {
		streamDeck.logger.info("GameBrowser.onKeyDown: key pressed");

		// Step 1: Resolve the appId
		let appId = this.selectedAppId;
		streamDeck.logger.info(`GameBrowser.onKeyDown: selectedAppId=${appId ?? "null (will auto-detect)"}`);

		if (!appId) {
			const api = getSteamApi();
			if (!api) {
				streamDeck.logger.warn("GameBrowser.onKeyDown: no SteamApi (missing API key or Steam ID)");
				await ev.action.showAlert();
				return;
			}
			streamDeck.logger.info("GameBrowser.onKeyDown: detecting currently running game...");
			const game = await api.getCurrentGame().catch((err: unknown) => {
				streamDeck.logger.error(`GameBrowser.onKeyDown: getCurrentGame failed — ${String(err)}`);
				return null;
			});
			if (!game) {
				streamDeck.logger.warn("GameBrowser.onKeyDown: no game currently running");
				await ev.action.showAlert();
				await ev.action.setTitle("No game\nrunning");
				return;
			}
			appId = game.appId;
			streamDeck.logger.info(`GameBrowser.onKeyDown: detected running game appId=${appId}`);
		}

		// Step 2: Detect device type and set page size accordingly
		const deviceType = ev.action.device.type as number;
		const deviceInfo = DEVICE_PROFILE[deviceType];
		const pageSize = deviceInfo?.pageSize ?? 10;
		streamDeck.logger.info(`GameBrowser.onKeyDown: deviceType=${deviceType} mappedProfile="${deviceInfo?.profile ?? "none"}" pageSize=${pageSize}`);

		const grid = getGridController();
		grid.setPageSize(pageSize);

		// Step 3: Load game into grid
		try {
			await ev.action.setTitle("Loading…");
			streamDeck.logger.info(`GameBrowser.onKeyDown: calling grid.loadGame(${appId})...`);
			await grid.loadGame(appId);
			this.gameName = grid.getGameName();
			streamDeck.logger.info(`GameBrowser.onKeyDown: grid loaded — game="${this.gameName}"`);

			const { unlocked, total, pct } = grid.getStats();
			const name = (this.gameName ?? "Game").length > 14
				? (this.gameName ?? "Game").slice(0, 12) + "…"
				: (this.gameName ?? "Game");
			await ev.action.setTitle(`${name}\n${unlocked}/${total} ${pct}%`);
		} catch (err) {
			streamDeck.logger.error(`GameBrowser.onKeyDown: grid.loadGame failed — ${String(err)}`);
			await ev.action.showAlert();
			await ev.action.setTitle("Error");
			return;
		}

		// Step 4: Auto-switch to grid profile
		const settings = ev.payload.settings;
		const autoSwitch = settings.autoSwitchProfile !== false; // default true
		streamDeck.logger.info(`GameBrowser.onKeyDown: autoSwitch=${autoSwitch} profileOverride="${settings.profileName ?? "none"}"`);

		if (autoSwitch) {
			// Use custom override, or fall back to auto-detected bundled profile
			const profileName = settings.profileName?.trim() || deviceInfo?.profile;
			if (profileName) {
				streamDeck.logger.info(`GameBrowser.onKeyDown: switching to profile "${profileName}" on device ${ev.action.device.id}`);
				try {
					await streamDeck.profiles.switchToProfile(ev.action.device.id, profileName);
					streamDeck.logger.info(`GameBrowser.onKeyDown: switchToProfile OK`);
				} catch (err) {
					streamDeck.logger.error(`GameBrowser.onKeyDown: switchToProfile failed — ${String(err)}`);
				}
			} else {
				streamDeck.logger.warn(`GameBrowser.onKeyDown: autoSwitch enabled but no profile found for deviceType=${deviceType}`);
			}
		}
	}

	// ── Helpers ─────────────────────────────────────────────

	private async resolveGameName(actionObj: { setTitle: (t: string) => Promise<void> }): Promise<void> {
		if (!this.selectedAppId) return;

		const api = getSteamApi();
		if (!api) {
			await actionObj.setTitle(`App\n${this.selectedAppId}`);
			return;
		}

		const games = await api.getOwnedGames().catch(() => [] as { appid: number; name: string }[]);
		const game = games.find((g) => g.appid === this.selectedAppId);
		this.gameName = game?.name ?? `App ${this.selectedAppId}`;

		const name = this.gameName.length > 14 ? this.gameName.slice(0, 12) + "…" : this.gameName;
		await actionObj.setTitle(name);
	}

	/** Fetch owned games and send list to the PI via sendToPropertyInspector. */
	private async sendGamesToPI(): Promise<void> {
		const api = getSteamApi();
		if (!api) {
			streamDeck.logger.warn("GameBrowser.sendGamesToPI: no SteamApi available");
			await streamDeck.ui.sendToPropertyInspector({ type: "gamesError", message: "Steam API not configured. Set your API key and Steam ID first." });
			return;
		}

		streamDeck.logger.info("GameBrowser.sendGamesToPI: fetching owned games...");
		try {
			const games = await api.getOwnedGames();
			streamDeck.logger.info(`GameBrowser.sendGamesToPI: got ${games.length} games, sending to PI`);
			await streamDeck.ui.sendToPropertyInspector({
				type: "games",
				games: games.map((g) => ({ appid: g.appid, name: g.name })),
			});
		} catch (err) {
			streamDeck.logger.error(`GameBrowser.sendGamesToPI: getOwnedGames failed — ${String(err)}`);
			await streamDeck.ui.sendToPropertyInspector({ type: "gamesError", message: `Failed to load games: ${String(err)}` });
		}
	}
}
