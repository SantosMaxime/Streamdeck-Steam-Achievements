import streamDeck from "@elgato/streamdeck";
import { SteamApiClient } from "./services/steam-api";
import { getSteamApi, setSteamApi } from "./services/steam-client-holder";
import { getGridController } from "./services/grid-controller";
import { DashboardLevel, DashboardTotal, DashboardPerfect } from "./actions/dashboard";
import { AchievementRadar } from "./actions/achievement-radar";
import { GridCell } from "./actions/grid-cell";
import { GridPrev, GridNext, GridBack } from "./actions/grid-nav";
import { GridInfo } from "./actions/grid-info";
import { GameBrowser } from "./actions/game-browser";
import { DailyPick } from "./actions/daily-pick";

type GlobalSettings = {
	apiKey?: string;
	steamId?: string;
};

// ── Steam API initialization ─────────────────────────────

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	const { apiKey, steamId } = ev.settings;
	if (apiKey && steamId) {
		const existing = getSteamApi();
		if (!existing) {
			setSteamApi(new SteamApiClient(apiKey, steamId));
			streamDeck.logger.info("SteamApiClient initialized.");
		} else {
			existing.updateCredentials(apiKey, steamId);
			streamDeck.logger.info("SteamApiClient credentials updated.");
		}
	} else {
		streamDeck.logger.warn("Missing API key or SteamID in global settings.");
	}
});

// ── Auto game watcher ────────────────────────────────────
//
// Polls every 30 s for the currently running Steam game.
// When a game starts  → automatically loads its achievements into the grid.
// When a game stops   → clears the grid.
// No button press required; the grid updates silently in the background.

const GAME_POLL_INTERVAL_MS = 30_000;
let watchedAppId: number | null = null;

async function pollCurrentGame(): Promise<void> {
	const api = getSteamApi();
	if (!api) return; // API not yet configured

	let game: { appId: number; name: string } | null = null;
	try {
		game = await api.getCurrentGame();
	} catch (err) {
		streamDeck.logger.warn(`GameWatcher: getCurrentGame failed — ${String(err)}`);
		return;
	}

	const appId = game?.appId ?? null;
	if (appId === watchedAppId) return; // no change

	const prev = watchedAppId;
	watchedAppId = appId;

	const grid = getGridController();

	if (appId !== null) {
		streamDeck.logger.info(`GameWatcher: game started — appId=${appId} name="${game!.name}" (was ${prev ?? "none"})`);
		try {
			await grid.loadGame(appId);
		} catch (err) {
			streamDeck.logger.error(`GameWatcher: grid.loadGame(${appId}) failed — ${String(err)}`);
		}
	} else {
		streamDeck.logger.info(`GameWatcher: game stopped (was appId=${prev}), clearing grid`);
		await grid.clear().catch((err) => streamDeck.logger.error(`GameWatcher: grid.clear failed — ${String(err)}`));
	}
}

// ── Register actions ─────────────────────────────────────

streamDeck.actions.registerAction(new DashboardLevel());
streamDeck.actions.registerAction(new DashboardTotal());
streamDeck.actions.registerAction(new DashboardPerfect());
streamDeck.actions.registerAction(new AchievementRadar());
streamDeck.actions.registerAction(new GridCell());
streamDeck.actions.registerAction(new GridPrev());
streamDeck.actions.registerAction(new GridNext());
streamDeck.actions.registerAction(new GridBack());
streamDeck.actions.registerAction(new GridInfo());
streamDeck.actions.registerAction(new GameBrowser());
streamDeck.actions.registerAction(new DailyPick());

// ── Connect ──────────────────────────────────────────────

streamDeck.connect().then(() => {
	streamDeck.settings.getGlobalSettings();

	// Start game watcher after connection is established.
	// Initial check runs after a short delay (settings may not be loaded yet).
	setTimeout(() => {
		void pollCurrentGame();
		setInterval(() => void pollCurrentGame(), GAME_POLL_INTERVAL_MS);
	}, 3_000);
});
