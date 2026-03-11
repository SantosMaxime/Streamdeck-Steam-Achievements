/**
 * Settings — configure Steam API key and Steam ID.
 *
 * Place this button on your Stream Deck to set up your credentials once.
 * The key shows live connection status:
 *   · Not Configured  — credentials missing
 *   · Configured ✓    — credentials present
 * Press the key to test the connection and confirm it works.
 *
 * Credentials are stored in global settings and shared across all
 * Steam Achievement Hunter actions.
 */

import streamDeck, {
	action,
	DidReceiveGlobalSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getSteamApi } from "../services/steam-client-holder";
import { renderSettingsKey } from "../services/svg-renderer";

type GlobalSettings = {
	apiKey?: string;
	steamId?: string;
};

@action({ UUID: "com.maxik.steam-achievements.settings" })
export class SettingsAction extends SingletonAction {
	private unsubscribe: (() => void) | null = null;
	private testTimer: ReturnType<typeof setTimeout> | null = null;

	override async onWillAppear(_ev: WillAppearEvent): Promise<void> {
		await this.renderKey();

		// Subscribe to global settings changes so the key updates live
		const handler = streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>(async () => {
			await this.renderKey();
		});
		this.unsubscribe = () => handler.dispose();
	}

	override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		if (this.testTimer) {
			clearTimeout(this.testTimer);
			this.testTimer = null;
		}
	}

	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		const api = getSteamApi();
		if (!api) {
			await this.setKeyState("unconfigured");
			return;
		}

		await this.setKeyState("testing");

		try {
			await api.getPlayerSummary();
			await this.setKeyState("configured");
		} catch {
			await this.setKeyState("error");
		}

		// Revert to normal state after 3 seconds
		if (this.testTimer) clearTimeout(this.testTimer);
		this.testTimer = setTimeout(async () => {
			this.testTimer = null;
			await this.renderKey();
		}, 3_000);
	}

	// ── Helpers ────────────────────────────────────────────

	private async renderKey(): Promise<void> {
		const api = getSteamApi();
		const state = api ? "configured" : "unconfigured";
		await this.setKeyState(state);
	}

	private async setKeyState(state: "configured" | "unconfigured" | "testing" | "error"): Promise<void> {
		for (const a of this.actions) {
			await a.setImage(renderSettingsKey(state));
			await a.setTitle(""); // title is embedded in the SVG
		}
	}
}
