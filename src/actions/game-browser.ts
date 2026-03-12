/**
 * Game Browser — select a game to load into the achievement grid.
 *
 * Press the key to load the currently running game's achievements, or
 * configure a specific App ID in the Property Inspector.
 *
 * In the PI, use "Load my games" to browse your library and click a game —
 * achievements load into the grid immediately without a key press.
 *
 * Always auto-switches to the correct bundled grid profile for your device.
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
import { DEVICE_PROFILE } from "../services/device-profiles";

type GameBrowserSettings = {
	/** Selected game appId (set from PI game picker). Leave empty to auto-detect the running game. */
	appId?: number;
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

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, GameBrowserSettings>): Promise<void> {
		const msg = ev.payload as Record<string, unknown>;
		const type = typeof msg === "object" && msg !== null ? String(msg["type"] ?? "") : "";

		if (type === "requestGames") {
			await this.sendGamesToPI();
		} else if (type === "browseGames") {
			await this.browseGamesOnGrid(ev.action.device);
		} else if (type === "loadGame") {
			const appId = typeof msg["appId"] === "number" ? (msg["appId"] as number) : null;
			if (appId) {
				await this.loadGameIntoGrid(appId, ev.action.device);
			}
		}
	}

	override async onKeyDown(ev: KeyDownEvent<GameBrowserSettings>): Promise<void> {
		let appId = this.selectedAppId;

		if (!appId) {
			const api = getSteamApi();
			if (!api) {
				await ev.action.showAlert();
				return;
			}
			const game = await api.getCurrentGame().catch(() => null);
			if (!game) {
				// No game running — show the games browser on the grid instead.
				await this.browseGamesOnGrid(ev.action.device);
				return;
			}
			appId = game.appId;
		}

		await this.loadGameIntoGrid(appId, ev.action.device);
	}

	// ── Helpers ─────────────────────────────────────────────

	/** Load a game into the grid and auto-switch to the correct bundled profile. */
	private async loadGameIntoGrid(
		appId: number,
		device: { id: string; type: number },
	): Promise<void> {
		const deviceInfo = DEVICE_PROFILE[device.type as number];
		const pageSize = deviceInfo?.pageSize ?? 10;

		const grid = getGridController();
		grid.setPageSize(pageSize);

		for (const a of this.actions) {
			await a.setTitle("Loading…");
		}

		try {
			await grid.loadGame(appId);
			this.gameName = grid.getGameName();
			const { unlocked, total, pct } = grid.getStats();
			const raw = this.gameName ?? "Game";
			const name = raw.length > 14 ? raw.slice(0, 12) + "…" : raw;
			for (const a of this.actions) {
				await a.setTitle(`${name}\n${unlocked}/${total} ${pct}%`);
			}
		} catch (err) {
			streamDeck.logger.error(`GameBrowser: loadGame failed — ${String(err)}`);
			for (const a of this.actions) {
				await a.showAlert();
				await a.setTitle("Error");
			}
			return;
		}

		if (deviceInfo?.profile) {
			try {
				await streamDeck.profiles.switchToProfile(device.id, deviceInfo.profile);
			} catch (err) {
				streamDeck.logger.error(`GameBrowser: switchToProfile failed — ${String(err)}`);
			}
		}
	}

	/** Fetch owned games and put the grid into games-browse mode, then switch to the grid profile. */
	private async browseGamesOnGrid(device: { id: string; type: number }): Promise<void> {
		const api = getSteamApi();
		if (!api) {
			for (const a of this.actions) await a.showAlert();
			return;
		}

		for (const a of this.actions) await a.setTitle("Loading…");

		let games: { appid: number; name: string }[];
		try {
			games = await api.getOwnedGames();
		} catch (err) {
			streamDeck.logger.error(`GameBrowser: browseGames failed — ${String(err)}`);
			for (const a of this.actions) {
				await a.showAlert();
				await a.setTitle("Load\ngame");
			}
			return;
		}

		const deviceInfo = DEVICE_PROFILE[device.type as number];
		const pageSize = deviceInfo?.pageSize ?? 10;
		const grid = getGridController();
		grid.setPageSize(pageSize);
		await grid.browseGames(games);

		for (const a of this.actions) await a.setTitle("Games");

		if (deviceInfo?.profile) {
			try {
				await streamDeck.profiles.switchToProfile(device.id, deviceInfo.profile);
			} catch (err) {
				streamDeck.logger.error(`GameBrowser: switchToProfile failed — ${String(err)}`);
			}
		}
	}

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

	private async sendGamesToPI(): Promise<void> {
		const api = getSteamApi();
		if (!api) {
			await streamDeck.ui.sendToPropertyInspector({ type: "gamesError", message: "Steam API not configured. Set your API key and Steam ID via the Settings action." });
			return;
		}
		try {
			const games = await api.getOwnedGames();
			await streamDeck.ui.sendToPropertyInspector({
				type: "games",
				games: games.map((g) => ({ appid: g.appid, name: g.name })),
			});
		} catch (err) {
			await streamDeck.ui.sendToPropertyInspector({ type: "gamesError", message: `Failed to load games: ${String(err)}` });
		}
	}
}
