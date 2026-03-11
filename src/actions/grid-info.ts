/**
 * Grid Info — displays a circular progress ring and game stats.
 *
 * Shows: game name + "23/50 (46%)" with an SVG progress ring.
 * Updates when global settings change (gridVersion).
 */

import streamDeck, {
	action,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getGridController, type SortMode } from "../services/grid-controller";
import { renderProgressRing } from "../services/svg-renderer";

@action({ UUID: "com.maxik.steam-achievements.grid-info" })
export class GridInfo extends SingletonAction {
	private disposable?: { dispose: () => void };

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
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

	/** Press cycles through sort modes: default → rarest → alpha → locked-only → unlocked-only → default */
	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		const grid = getGridController();
		const modes: SortMode[] = ["default", "rarest", "alpha", "locked-only", "unlocked-only"];
		const currentIdx = modes.indexOf(grid.getSortMode());
		const nextMode = modes[(currentIdx + 1) % modes.length];
		await grid.setSortMode(nextMode);
	}

	private async render(actionObj: { setImage: (img?: string) => Promise<void>; setTitle: (t: string) => Promise<void> }): Promise<void> {
		const grid = getGridController();
		const gameName = grid.getGameName();

		if (!gameName) {
			await actionObj.setTitle("No game\nloaded");
			await actionObj.setImage(renderProgressRing(0));
			return;
		}

		const { unlocked, total, pct } = grid.getStats();
		const sortLabel = grid.getSortMode() === "default" ? "" : `\n[${grid.getSortMode()}]`;

		const name = gameName.length > 16 ? gameName.slice(0, 14) + "…" : gameName;
		await actionObj.setTitle(`${name}\n${unlocked}/${total} (${pct}%)${sortLabel}`);
		await actionObj.setImage(renderProgressRing(pct));
	}
}
