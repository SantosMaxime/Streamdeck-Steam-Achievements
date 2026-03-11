/**
 * Profile Launcher — jump to the achievement grid profile with one press.
 *
 * Place this button on any Stream Deck profile (e.g. your main layout).
 * Pressing it switches directly to the achievement grid profile.
 *
 * Two modes (configured in the Property Inspector):
 *   · Auto-detect (default) — picks the correct bundled grid profile for
 *     the current device type (Standard, Mini, XL, +, Neo) automatically.
 *   · Choose profile — lets you specify a custom profile name for advanced
 *     setups or non-standard device configurations.
 */

import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
} from "@elgato/streamdeck";
import { DEVICE_PROFILE } from "../services/device-profiles";
import { renderProfileLauncherKey } from "../services/svg-renderer";

type ProfileLauncherSettings = {
	/** "auto" uses the device-mapped bundled profile; "manual" uses profileName. Default: "auto". */
	mode?: "auto" | "manual";
	/** Custom profile name (used when mode is "manual"). Must match a name in manifest.json exactly. */
	profileName?: string;
};

@action({ UUID: "com.maxik.steam-achievements.profile-launcher" })
export class ProfileLauncher extends SingletonAction<ProfileLauncherSettings> {
	override async onWillAppear(ev: WillAppearEvent<ProfileLauncherSettings>): Promise<void> {
		await this.renderKey(ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ProfileLauncherSettings>): Promise<void> {
		for (const a of this.actions) {
			await this.renderKeyForAction(a, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<ProfileLauncherSettings>): Promise<void> {
		const settings = ev.payload.settings;
		const mode = settings.mode ?? "auto";
		const deviceId = ev.action.device.id;
		const deviceType = ev.action.device.type as number;

		let profileName: string | undefined;

		if (mode === "manual") {
			profileName = settings.profileName?.trim() || undefined;
			if (!profileName) {
				streamDeck.logger.warn("ProfileLauncher.onKeyDown: manual mode but no profile name configured");
				await ev.action.showAlert();
				return;
			}
		} else {
			// Auto mode: look up the bundled profile for this device type
			const deviceInfo = DEVICE_PROFILE[deviceType];
			profileName = deviceInfo?.profile;
			if (!profileName) {
				streamDeck.logger.warn(`ProfileLauncher.onKeyDown: no bundled profile for deviceType=${deviceType}`);
				await ev.action.showAlert();
				return;
			}
		}

		streamDeck.logger.info(`ProfileLauncher.onKeyDown: switching to profile "${profileName}" on device ${deviceId}`);
		try {
			await streamDeck.profiles.switchToProfile(deviceId, profileName);
		} catch (err) {
			streamDeck.logger.error(`ProfileLauncher.onKeyDown: switchToProfile failed — ${String(err)}`);
			await ev.action.showAlert();
		}
	}

	// ── Helpers ────────────────────────────────────────────

	private async renderKey(settings: ProfileLauncherSettings): Promise<void> {
		for (const a of this.actions) {
			await this.renderKeyForAction(a, settings);
		}
	}

	private async renderKeyForAction(
		a: { setImage: (img: string) => Promise<void>; setTitle: (t: string) => Promise<void> },
		settings: ProfileLauncherSettings,
	): Promise<void> {
		const label = settings.mode === "manual" && settings.profileName?.trim()
			? settings.profileName.trim()
			: "Go to Grid";
		await a.setImage(renderProfileLauncherKey(label));
		await a.setTitle(""); // label is embedded in SVG
	}
}
