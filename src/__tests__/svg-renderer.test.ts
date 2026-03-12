import { describe, it, expect } from "vitest";
import {
	getRarityInfo,
	renderLockedCell,
	renderUnlockedCell,
	renderCelebrationCell,
	renderProgressRing,
	renderEmptyCell,
	renderNavButton,
	renderGameBrowserKey,
	renderDailyPickKey,
} from "../services/svg-renderer";

/** Decode a data URI produced by svgToDataUri back into raw SVG text. */
function decodeSvgDataUri(dataUri: string): string {
	return decodeURIComponent(
		dataUri.replace("data:image/svg+xml;charset=utf-8,", ""),
	);
}

// ── getRarityInfo ───────────────────────────────────────────

describe("getRarityInfo", () => {
	it("returns Legendary (gold) for < 1%", () => {
		const info = getRarityInfo(0.5);
		expect(info.label).toBe("Legendary");
		expect(info.color).toBe("#f59e0b");
	});

	it("returns Ultra Rare (purple) for 1-5%", () => {
		const info = getRarityInfo(3);
		expect(info.label).toBe("Ultra Rare");
		expect(info.color).toBe("#a855f7");
	});

	it("returns Rare (blue) for 5-20%", () => {
		const info = getRarityInfo(10);
		expect(info.label).toBe("Rare");
		expect(info.color).toBe("#3b82f6");
	});

	it("returns Uncommon (green) for 20-50%", () => {
		const info = getRarityInfo(35);
		expect(info.label).toBe("Uncommon");
		expect(info.color).toBe("#22c55e");
	});

	it("returns Common (gray) for >= 50%", () => {
		const info = getRarityInfo(75);
		expect(info.label).toBe("Common");
		expect(info.color).toBe("#6b7280");
	});

	it("returns unknown (gray / ???) for negative values", () => {
		const info = getRarityInfo(-1);
		expect(info.label).toBe("???");
		expect(info.color).toBe("#6b7280");
	});

	// Boundary checks
	it("treats exactly 0% as Legendary", () => {
		expect(getRarityInfo(0).label).toBe("Legendary");
	});

	it("treats exactly 1% as Ultra Rare", () => {
		expect(getRarityInfo(1).label).toBe("Ultra Rare");
	});

	it("treats exactly 5% as Rare", () => {
		expect(getRarityInfo(5).label).toBe("Rare");
	});

	it("treats exactly 20% as Uncommon", () => {
		expect(getRarityInfo(20).label).toBe("Uncommon");
	});

	it("treats exactly 50% as Common", () => {
		expect(getRarityInfo(50).label).toBe("Common");
	});
});

// ── renderLockedCell ────────────────────────────────────────

describe("renderLockedCell", () => {
	const icon = "data:image/png;base64,AAAA";
	const result = renderLockedCell(icon, 10);

	it("returns a data URI", () => {
		expect(result).toMatch(/^data:image\/svg\+xml;/);
	});

	it("contains the icon reference", () => {
		const svg = decodeSvgDataUri(result);
		expect(svg).toContain("AAAA");
	});

	it("has the rarity color strip at the bottom", () => {
		const svg = decodeSvgDataUri(result);
		// 10% => Rare => blue
		expect(svg).toContain('fill="#3b82f6"');
	});

	it("renders the icon with reduced opacity (locked look)", () => {
		const svg = decodeSvgDataUri(result);
		expect(svg).toContain('opacity="0.4"');
	});
});

// ── renderUnlockedCell ──────────────────────────────────────

describe("renderUnlockedCell", () => {
	const icon = "data:image/png;base64,BBBB";
	const result = renderUnlockedCell(icon, 0.5);

	it("returns a data URI", () => {
		expect(result).toMatch(/^data:image\/svg\+xml;/);
	});

	it("contains the icon reference at full opacity", () => {
		const svg = decodeSvgDataUri(result);
		expect(svg).toContain("BBBB");
		expect(svg).not.toContain('opacity="0.4"');
	});

	it("uses the rarity color for the bottom strip", () => {
		const svg = decodeSvgDataUri(result);
		// 0.5% => Legendary => gold
		expect(svg).toContain('fill="#f59e0b"');
	});
});

// ── renderCelebrationCell ───────────────────────────────────

describe("renderCelebrationCell", () => {
	const icon = "data:image/png;base64,CCCC";

	it("returns a data URI for frame 0", () => {
		expect(renderCelebrationCell(icon, 0)).toMatch(/^data:image\/svg\+xml;/);
	});

	it("returns a data URI for frame 1", () => {
		expect(renderCelebrationCell(icon, 1)).toMatch(/^data:image\/svg\+xml;/);
	});

	it("frame 0 has a smaller glow size (stdDeviation=4)", () => {
		const svg = decodeSvgDataUri(renderCelebrationCell(icon, 0));
		expect(svg).toContain('stdDeviation="4"');
	});

	it("frame 1 has a larger glow size (stdDeviation=8)", () => {
		const svg = decodeSvgDataUri(renderCelebrationCell(icon, 1));
		expect(svg).toContain('stdDeviation="8"');
	});

	it("frame 0 and frame 1 produce different SVGs", () => {
		const svg0 = decodeSvgDataUri(renderCelebrationCell(icon, 0));
		const svg1 = decodeSvgDataUri(renderCelebrationCell(icon, 1));
		expect(svg0).not.toBe(svg1);
	});
});

// ── renderProgressRing ──────────────────────────────────────

describe("renderProgressRing", () => {
	it("returns a data URI", () => {
		expect(renderProgressRing(50)).toMatch(/^data:image\/svg\+xml;/);
	});

	it("contains 0% text for 0 percent", () => {
		const svg = decodeSvgDataUri(renderProgressRing(0));
		expect(svg).toContain("0%");
	});

	it("contains 50% text for 50 percent", () => {
		const svg = decodeSvgDataUri(renderProgressRing(50));
		expect(svg).toContain("50%");
	});

	it("contains 100% text for 100 percent", () => {
		const svg = decodeSvgDataUri(renderProgressRing(100));
		expect(svg).toContain("100%");
	});

	it("uses gold color at 100%", () => {
		const svg = decodeSvgDataUri(renderProgressRing(100));
		expect(svg).toContain("#f59e0b");
	});

	it("uses green color at 75%", () => {
		const svg = decodeSvgDataUri(renderProgressRing(75));
		expect(svg).toContain("#22c55e");
	});

	it("uses blue color at 50%", () => {
		const svg = decodeSvgDataUri(renderProgressRing(50));
		expect(svg).toContain("#3b82f6");
	});

	it("uses gray color below 50%", () => {
		const svg = decodeSvgDataUri(renderProgressRing(25));
		expect(svg).toContain('stroke="#6b7280"');
	});

	it("contains no image element", () => {
		const svg = decodeSvgDataUri(renderProgressRing(50));
		expect(svg).not.toContain("<image");
	});
});

// ── renderEmptyCell ─────────────────────────────────────────

describe("renderEmptyCell", () => {
	const result = renderEmptyCell();

	it("returns a data URI", () => {
		expect(result).toMatch(/^data:image\/svg\+xml;/);
	});

	it("has a dashed border (stroke-dasharray)", () => {
		const svg = decodeSvgDataUri(result);
		expect(svg).toContain("stroke-dasharray");
	});

	it("is a valid SVG document", () => {
		const svg = decodeSvgDataUri(result);
		expect(svg).toContain("<svg");
		expect(svg).toContain("</svg>");
	});
});

// ── renderNavButton ─────────────────────────────────────────

describe("renderNavButton", () => {
	describe("prev", () => {
		const result = renderNavButton("prev");

		it("returns a valid SVG data URI", () => {
			expect(result).toMatch(/^data:image\/svg\+xml;/);
		});

		it("contains a polyline (left chevron)", () => {
			const svg = decodeSvgDataUri(result);
			expect(svg).toContain("<polyline");
		});
	});

	describe("next", () => {
		const result = renderNavButton("next");

		it("returns a valid SVG data URI", () => {
			expect(result).toMatch(/^data:image\/svg\+xml;/);
		});

		it("contains a polyline (right chevron)", () => {
			const svg = decodeSvgDataUri(result);
			expect(svg).toContain("<polyline");
		});
	});

	describe("back", () => {
		const result = renderNavButton("back");

		it("returns a valid SVG data URI", () => {
			expect(result).toMatch(/^data:image\/svg\+xml;/);
		});

		it("contains a path (home icon)", () => {
			const svg = decodeSvgDataUri(result);
			expect(svg).toContain("<path");
		});
	});

	it("produces different SVGs for prev, next, and back", () => {
		const prev = decodeSvgDataUri(renderNavButton("prev"));
		const next = decodeSvgDataUri(renderNavButton("next"));
		const back = decodeSvgDataUri(renderNavButton("back"));
		expect(prev).not.toBe(next);
		expect(prev).not.toBe(back);
		expect(next).not.toBe(back);
	});
});

// ── renderGameBrowserKey ────────────────────────────────────

describe("renderGameBrowserKey", () => {
	const result = renderGameBrowserKey();

	it("returns a valid SVG data URI", () => {
		expect(result).toMatch(/^data:image\/svg\+xml;/);
	});

	it("contains controller icon elements", () => {
		const svg = decodeSvgDataUri(result);
		expect(svg).toContain("<circle");
		expect(svg).toContain("<line");
	});
});

// ── renderDailyPickKey ──────────────────────────────────────

describe("renderDailyPickKey", () => {
	const result = renderDailyPickKey();

	it("returns a valid SVG data URI", () => {
		expect(result).toMatch(/^data:image\/svg\+xml;/);
	});

	it("contains a star polygon", () => {
		const svg = decodeSvgDataUri(result);
		expect(svg).toContain("<polygon");
		// Star uses gold fill
		expect(svg).toContain('fill="#f59e0b"');
	});
});
