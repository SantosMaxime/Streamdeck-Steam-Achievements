/**
 * Grid Info — displays progress stats or games-mode info.
 *
 * Achievements mode: shows the progress ring + game name + unlocked/total count.
 * Games mode:        shows how many games are loaded; press to go back to achievements.
 */

import streamDeck, {
	action,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { getGridController } from "../services/grid-controller";
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

	/** In games mode: press to go back to achievements. In achievements mode: no action. */
	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		const grid = getGridController();
		if (grid.getMode() === "games") {
			await grid.restoreAchievements();
		}
	}

	private async render(actionObj: { setImage: (img?: string) => Promise<void>; setTitle: (t: string) => Promise<void> }): Promise<void> {
		const grid = getGridController();

		if (grid.getMode() === "games") {
			const count = grid.getGamesCount();
			const page = grid.getPage() + 1;
			const pageCount = grid.getPageCount();
			await actionObj.setTitle(`${count} games\nPage ${page}/${pageCount}\n← Back`);
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
		const name = gameName.length > 16 ? gameName.slice(0, 14) + "…" : gameName;
		await actionObj.setTitle(`${name}\n${unlocked}/${total} (${pct}%)`);
		await actionObj.setImage(renderProgressRing(pct));
	}
}
