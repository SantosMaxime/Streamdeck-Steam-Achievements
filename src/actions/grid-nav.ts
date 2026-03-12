/**
 * Grid Navigation — Prev / Next actions.
 *
 * Grid Prev: go to previous page
 * Grid Next: go to next page
 *
 * Note: Grid navigation back is now handled by Elgato's built-in
 * profile switching (available in the Action Library).
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
