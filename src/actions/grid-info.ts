/**
 * Grid Info — displays a circular progress ring and game stats.
 *
 * Configurable click behaviour (set in the Property Inspector):
 *   mode-switch  → toggles between games browse and achievements display
 *   sort         → cycles through sort modes (default → rarest → alpha → locked → unlocked)
 *   nothing      → key press does nothing (info display only)
 */

import streamDeck, {
	action,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getGridController, type SortMode } from "../services/grid-controller";
import { getSteamApi } from "../services/steam-client-holder";
import { renderProgressRing } from "../services/svg-renderer";

type GridInfoSettings = {
	clickBehavior?: "mode-switch" | "sort" | "nothing";
};

@action({ UUID: "com.maxik.steam-achievements.grid-info" })
export class GridInfo extends SingletonAction<GridInfoSettings> {
	private disposable?: { dispose: () => void };

	override async onWillAppear(ev: WillAppearEvent<GridInfoSettings>): Promise<void> {
		await this.render(ev.action);

		this.disposable?.dispose();
		this.disposable = streamDeck.settings.onDidReceiveGlobalSettings(() => {
			for (const a of this.actions) {
				this.render(a);
			}
		});
	}

	override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
		this.disposable?.dispose();
		this.disposable = undefined;
	}

	override async onKeyDown(ev: KeyDownEvent<GridInfoSettings>): Promise<void> {
		const behavior = ev.payload.settings.clickBehavior ?? "mode-switch";
		const grid = getGridController();

		if (behavior === "mode-switch") {
			if (grid.getMode() === "games") {
				await grid.restoreAchievements();
			} else {
				const api = getSteamApi();
				if (!api) { await ev.action.showAlert(); return; }
				try {
					const games = await api.getOwnedGames();
					await grid.browseGames(games);
				} catch {
					await ev.action.showAlert();
				}
			}
		} else if (behavior === "sort") {
			const modes: SortMode[] = ["default", "rarest", "alpha", "locked-only", "unlocked-only"];
			const currentIdx = modes.indexOf(grid.getSortMode());
			await grid.setSortMode(modes[(currentIdx + 1) % modes.length]);
		}
		// "nothing" → no action
	}

	private async render(actionObj: { setImage: (img?: string) => Promise<void>; setTitle: (t: string) => Promise<void> }): Promise<void> {
		const grid = getGridController();

		if (grid.getMode() === "games") {
			const count = grid.getGamesCount();
			const page = grid.getPage() + 1;
			const pageCount = grid.getPageCount();
			await actionObj.setTitle(`${count} games\nPage ${page}/${pageCount}`);
			await actionObj.setImage(renderProgressRing(0));
			return;
		}

		const gameName = grid.getGameName();
		if (!gameName) {
			await actionObj.setTitle("No game\nloaded");
			await actionObj.setImage(renderProgressRing(0));
			return;
		}

		const { unlocked, total, pct } = grid.getStats();
		const sortLabel = grid.getSortMode() !== "default" ? `\n[${grid.getSortMode()}]` : "";
		const name = gameName.length > 16 ? gameName.slice(0, 14) + "…" : gameName;
		await actionObj.setTitle(`${name}\n${unlocked}/${total} (${pct}%)${sortLabel}`);
		await actionObj.setImage(renderProgressRing(pct));
	}
}
