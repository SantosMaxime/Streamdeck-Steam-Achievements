import streamDeck from "@elgato/streamdeck";
import { SteamApiClient } from "./services/steam-api";
import { getSteamApi, setSteamApi } from "./services/steam-client-holder";
import { DashboardLevel, DashboardTotal, DashboardPerfect } from "./actions/dashboard";
import { AchievementRadar } from "./actions/achievement-radar";

type GlobalSettings = {
	apiKey?: string;
	steamId?: string;
};

// Listen for global settings to initialize the Steam API client.
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

// Register all actions.
streamDeck.actions.registerAction(new DashboardLevel());
streamDeck.actions.registerAction(new DashboardTotal());
streamDeck.actions.registerAction(new DashboardPerfect());
streamDeck.actions.registerAction(new AchievementRadar());

// Connect to Stream Deck and request global settings.
streamDeck.connect().then(() => {
	streamDeck.settings.getGlobalSettings();
});
