/**
 * Client for the Steam Web API.
 * Handles caching and rate-limit-friendly request patterns.
 */

const STEAM_API_BASE = "https://api.steampowered.com";

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

export interface PlayerSummary {
	steamid: string;
	personaname: string;
	avatarfull: string;
	profileurl: string;
	gameid?: string;         // appID of currently running game (string from API)
	gameextrainfo?: string;  // name of currently running game
}

export interface OwnedGame {
	appid: number;
	name: string;
	playtime_forever: number;
	img_icon_url: string;
	has_community_visible_stats?: boolean;
}

export interface Achievement {
	apiname: string;
	achieved: number;  // 0 or 1
	unlocktime: number;
}

export interface AchievementSchema {
	name: string;
	displayName: string;
	description: string;
	icon: string;
	icongray: string;
}

export interface PlayerAchievementsResponse {
	gameName: string;
	achievements: Achievement[];
}

export interface GameSchemaResponse {
	gameName: string;
	achievements: AchievementSchema[];
}

export interface GlobalStats {
	playerLevel: number;
	totalAchievements: number;
	perfectGames: number;
	totalGamesWithAchievements: number;
}

export class SteamApiClient {
	private apiKey: string;
	private steamId: string;
	private cache = new Map<string, CacheEntry<unknown>>();
	private readonly cacheTtlMs: number;

	constructor(apiKey: string, steamId: string, cacheTtlMs = 5 * 60 * 1000) {
		this.apiKey = apiKey;
		this.steamId = steamId;
		this.cacheTtlMs = cacheTtlMs;
	}

	updateCredentials(apiKey: string, steamId: string): void {
		if (apiKey !== this.apiKey || steamId !== this.steamId) {
			this.apiKey = apiKey;
			this.steamId = steamId;
			this.cache.clear();
		}
	}

	/**
	 * Get player profile summary (level, avatar, name).
	 */
	async getPlayerSummary(): Promise<PlayerSummary | null> {
		const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${this.apiKey}&steamids=${this.steamId}`;
		const data = await this.fetchCached<{ response: { players: PlayerSummary[] } }>("player-summary", url);
		return data?.response?.players?.[0] ?? null;
	}

	/**
	 * Get player Steam level.
	 */
	async getPlayerLevel(): Promise<number> {
		const url = `${STEAM_API_BASE}/IPlayerService/GetSteamLevel/v1/?key=${this.apiKey}&steamid=${this.steamId}`;
		const data = await this.fetchCached<{ response: { player_level: number } }>("player-level", url);
		return data?.response?.player_level ?? 0;
	}

	/**
	 * Get all owned games with achievement stats.
	 */
	async getOwnedGames(): Promise<OwnedGame[]> {
		const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${this.steamId}&include_appinfo=1&include_played_free_games=1`;
		const data = await this.fetchCached<{ response: { games: OwnedGame[] } }>("owned-games", url);
		return data?.response?.games ?? [];
	}

	/**
	 * Get player achievements for a specific game.
	 */
	async getPlayerAchievements(appId: number): Promise<PlayerAchievementsResponse | null> {
		const url = `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v1/?key=${this.apiKey}&steamid=${this.steamId}&appid=${appId}`;
		const data = await this.fetchCached<{
			playerstats: { gameName: string; achievements: Achievement[] };
		}>(`achievements-${appId}`, url);

		if (!data?.playerstats?.achievements) return null;
		return {
			gameName: data.playerstats.gameName,
			achievements: data.playerstats.achievements,
		};
	}

	/**
	 * Get achievement schema (names, descriptions, icons) for a game.
	 */
	async getGameSchema(appId: number): Promise<GameSchemaResponse | null> {
		const url = `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/?key=${this.apiKey}&appid=${appId}`;
		const data = await this.fetchCached<{
			game: { gameName: string; availableGameStats?: { achievements?: AchievementSchema[] } };
		}>(`schema-${appId}`, url);

		if (!data?.game?.availableGameStats?.achievements) return null;
		return {
			gameName: data.game.gameName,
			achievements: data.game.availableGameStats.achievements,
		};
	}

	/**
	 * Compute global stats: level, total achievements, perfect games.
	 * This is an expensive operation - it iterates all games with achievements.
	 */
	async getGlobalStats(): Promise<GlobalStats> {
		const [level, games] = await Promise.all([
			this.getPlayerLevel(),
			this.getOwnedGames(),
		]);

		// Filter games likely to have achievements
		const gamesWithStats = games.filter((g) => g.has_community_visible_stats);

		let totalAchievements = 0;
		let perfectGames = 0;
		let totalGamesWithAchievements = 0;

		// Process in batches to avoid rate limits
		const batchSize = 5;
		for (let i = 0; i < gamesWithStats.length; i += batchSize) {
			const batch = gamesWithStats.slice(i, i + batchSize);
			const results = await Promise.all(
				batch.map((g) => this.getPlayerAchievements(g.appid).catch(() => null)),
			);

			for (const result of results) {
				if (!result?.achievements?.length) continue;
				totalGamesWithAchievements++;
				const unlocked = result.achievements.filter((a) => a.achieved === 1).length;
				totalAchievements += unlocked;
				if (unlocked === result.achievements.length) {
					perfectGames++;
				}
			}

			// Small delay between batches to respect rate limits
			if (i + batchSize < gamesWithStats.length) {
				await this.delay(1500);
			}
		}

		return { playerLevel: level, totalAchievements, perfectGames, totalGamesWithAchievements };
	}

	/**
	 * Invalidate all cached data.
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Invalidate only the player summary cache (used for frequent game-detection polling).
	 */
	clearSummaryCache(): void {
		this.cache.delete("player-summary");
	}

	/**
	 * Get the currently running game, if any.
	 * Uses a dedicated short-lived cache (30s) suitable for polling.
	 */
	async getCurrentGame(): Promise<{ appId: number; name: string } | null> {
		const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${this.apiKey}&steamids=${this.steamId}`;
		const data = await this.fetchCached<{ response: { players: PlayerSummary[] } }>(
			"current-game", url, 30_000,
		);
		const summary = data?.response?.players?.[0];

		if (!summary?.gameid) return null;
		return { appId: parseInt(summary.gameid, 10), name: summary.gameextrainfo ?? "Unknown" };
	}

	/**
	 * Fetch a remote image URL and return it as a base64 data URI
	 * suitable for Stream Deck setImage().
	 */
	async fetchImageAsDataUri(imageUrl: string): Promise<string | null> {
		const cached = this.cache.get(`img-${imageUrl}`) as CacheEntry<string> | undefined;
		if (cached && cached.expiresAt > Date.now()) {
			return cached.data;
		}

		try {
			const response = await fetch(imageUrl);
			if (!response.ok) return null;

			const buffer = Buffer.from(await response.arrayBuffer());
			const contentType = response.headers.get("content-type") ?? "image/png";
			const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;

			// Cache images for 30 minutes (they rarely change)
			this.cache.set(`img-${imageUrl}`, { data: dataUri, expiresAt: Date.now() + 30 * 60 * 1000 });
			return dataUri;
		} catch {
			return null;
		}
	}

	private async fetchCached<T>(key: string, url: string, ttlMs?: number): Promise<T | null> {
		const cached = this.cache.get(key) as CacheEntry<T> | undefined;
		if (cached && cached.expiresAt > Date.now()) {
			return cached.data;
		}

		try {
			const response = await fetch(url);
			if (!response.ok) {
				return null;
			}
			const data = (await response.json()) as T;
			this.cache.set(key, { data, expiresAt: Date.now() + (ttlMs ?? this.cacheTtlMs) });
			return data;
		} catch {
			return null;
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
