import { SteamApiClient } from "./steam-api";

/**
 * Holds the global SteamApiClient instance.
 * Separated from plugin.ts to avoid circular dependencies with actions.
 */
let steamApi: SteamApiClient | null = null;

export function getSteamApi(): SteamApiClient | null {
	return steamApi;
}

export function setSteamApi(client: SteamApiClient): void {
	steamApi = client;
}
