/**
 * Grid Navigation — Prev / Next / Back actions.
 *
 * Grid Prev: go to previous page
 * Grid Next: go to next page
 * Grid Back: return to previous Stream Deck profile
 */

import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getGridController } from "../services/grid-controller";
import { renderNavButton } from "../services/svg-renderer";

// ── Grid Prev ──────────────────────────────────────────────

@action({ UUID: "com.maxik.steam-achievements.grid-prev" })
export class GridPrev extends SingletonAction {
	private disposable?: { dispose: () => void };

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		await ev.action.setImage(renderNavButton("prev"));
		await this.updateTitle(ev.action);

		this.disposable?.dispose();
		this.disposable = streamDeck.settings.onDidReceiveGlobalSettings(() => {
			for (const a of this.actions) {
				this.updateTitle(a);
			}
		});
	}

	override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
		this.disposable?.dispose();
		this.disposable = undefined;
	}

	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		const grid = getGridController();
		await grid.setPage(grid.getPage() - 1);
	}

	private async updateTitle(actionObj: { setTitle: (t: string) => Promise<void> }): Promise<void> {
		const grid = getGridController();
		const page = grid.getPage();
		const total = grid.getPageCount();
		await actionObj.setTitle(total > 1 ? `◀ ${page + 1}/${total}` : "◀");
	}
}

// ── Grid Next ──────────────────────────────────────────────

@action({ UUID: "com.maxik.steam-achievements.grid-next" })
export class GridNext extends SingletonAction {
	private disposable?: { dispose: () => void };

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		await ev.action.setImage(renderNavButton("next"));
		await this.updateTitle(ev.action);

		this.disposable?.dispose();
		this.disposable = streamDeck.settings.onDidReceiveGlobalSettings(() => {
			for (const a of this.actions) {
				this.updateTitle(a);
			}
		});
	}

	override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
		this.disposable?.dispose();
		this.disposable = undefined;
	}

	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		const grid = getGridController();
		await grid.setPage(grid.getPage() + 1);
	}

	private async updateTitle(actionObj: { setTitle: (t: string) => Promise<void> }): Promise<void> {
		const grid = getGridController();
		const page = grid.getPage();
		const total = grid.getPageCount();
		await actionObj.setTitle(total > 1 ? `${page + 1}/${total} ▶` : "▶");
	}
}

// ── Grid Back ──────────────────────────────────────────────

type GridBackSettings = {
	/**
	 * When set, pressing this key switches TO the named profile.
	 * When empty, it returns to the previous profile (default "Back" behaviour).
	 *
	 * Use this to place a "Open Grid" shortcut on any profile.
	 * The value must match the profile name exactly as registered in manifest.json
	 * (e.g. "profiles/grid-standard").
	 */
	targetProfile?: string;
};

@action({ UUID: "com.maxik.steam-achievements.grid-back" })
export class GridBack extends SingletonAction<GridBackSettings> {
	override async onWillAppear(ev: WillAppearEvent<GridBackSettings>): Promise<void> {
		await ev.action.setImage(renderNavButton("back"));
		await ev.action.setTitle(ev.payload.settings.targetProfile?.trim() ? "Grid" : "Back");
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<GridBackSettings>): Promise<void> {
		await ev.action.setTitle(ev.payload.settings.targetProfile?.trim() ? "Grid" : "Back");
	}

	override async onKeyDown(ev: KeyDownEvent<GridBackSettings>): Promise<void> {
		const target = ev.payload.settings.targetProfile?.trim();
		try {
			const deviceId = ev.action.device.id;
			// With a target: go TO that profile. Without: go BACK to the previous one.
			await streamDeck.profiles.switchToProfile(deviceId, target || undefined);
		} catch {
			await ev.action.showAlert();
		}
	}
}
