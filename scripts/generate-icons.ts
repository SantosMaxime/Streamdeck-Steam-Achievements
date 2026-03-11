/**
 * Icon generator for Steam Achievement Hunter.
 *
 * Produces all PNG icons needed by the Stream Deck plugin using a tiny
 * software rasterizer (no external dependencies).
 *
 * Run with:  npx tsx scripts/generate-icons.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ── PNG encoder (pure Node.js) ──────────────────────────────────────────────

function crc32(buf: Buffer): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < buf.length; i++) {
		crc ^= buf[i];
		for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const t = Buffer.from(type, "ascii");
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
	return Buffer.concat([len, t, data, crc]);
}

function canvasToPng(pixels: Uint8Array, w: number, h: number): Buffer {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
	const raw = Buffer.alloc(h * (1 + w * 4));
	for (let y = 0; y < h; y++) {
		raw[y * (1 + w * 4)] = 0; // filter: None
		for (let x = 0; x < w; x++) {
			const src = (y * w + x) * 4, dst = y * (1 + w * 4) + 1 + x * 4;
			raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1]; raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3];
		}
	}
	return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

// ── Pixel Canvas ────────────────────────────────────────────────────────────

class Canvas {
	pixels: Uint8Array;
	constructor(public w: number, public h: number) {
		this.pixels = new Uint8Array(w * h * 4); // all transparent
	}

	setPixel(x: number, y: number, r: number, g: number, b: number, a = 255): void {
		const xi = Math.round(x), yi = Math.round(y);
		if (xi < 0 || xi >= this.w || yi < 0 || yi >= this.h) return;
		const i = (yi * this.w + xi) * 4;
		const ao = this.pixels[i + 3] / 255, an = a / 255;
		const ac = an + ao * (1 - an);
		if (ac < 0.001) return;
		this.pixels[i]     = Math.round((r * an + this.pixels[i]     * ao * (1 - an)) / ac);
		this.pixels[i + 1] = Math.round((g * an + this.pixels[i + 1] * ao * (1 - an)) / ac);
		this.pixels[i + 2] = Math.round((b * an + this.pixels[i + 2] * ao * (1 - an)) / ac);
		this.pixels[i + 3] = Math.round(ac * 255);
	}

	fill(r: number, g: number, b: number, a = 255): void {
		for (let y = 0; y < this.h; y++)
			for (let x = 0; x < this.w; x++) this.setPixel(x, y, r, g, b, a);
	}

	fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
		for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.setPixel(x + dx, y + dy, r, g, b, a);
	}

	fillCircle(cx: number, cy: number, radius: number, r: number, g: number, b: number, a = 255): void {
		for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
			for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
				const dx = x - cx, dy = y - cy;
				if (dx * dx + dy * dy <= radius * radius) this.setPixel(x, y, r, g, b, a);
			}
	}

	drawRing(cx: number, cy: number, outer: number, inner: number, r: number, g: number, b: number, a = 255): void {
		const o2 = outer * outer, i2 = inner * inner;
		for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++)
			for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
				const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
				if (d2 <= o2 && d2 >= i2) this.setPixel(x, y, r, g, b, a);
			}
	}

	fillPoly(pts: [number, number][], r: number, g: number, b: number, a = 255): void {
		if (pts.length < 3) return;
		const minY = Math.floor(Math.min(...pts.map(p => p[1])));
		const maxY = Math.ceil(Math.max(...pts.map(p => p[1])));
		for (let y = minY; y <= maxY; y++) {
			const xs: number[] = [];
			for (let i = 0; i < pts.length; i++) {
				const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
				if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
					xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
			}
			xs.sort((a, b) => a - b);
			for (let i = 0; i < xs.length - 1; i += 2)
				for (let x = Math.floor(xs[i]); x <= Math.ceil(xs[i + 1]); x++)
					this.setPixel(x, y, r, g, b, a);
		}
	}

	toPng(): Buffer { return canvasToPng(this.pixels, this.w, this.h); }
}

// ── Icon drawing functions (scale-independent) ──────────────────────────────
// Coordinates are normalized 0-1, multiplied by canvas size at draw time.

function s(c: Canvas, v: number) { return v * Math.min(c.w, c.h); }

/** Plugin icon: Steam dark background + gold trophy */
function drawPluginIcon(c: Canvas): void {
	// Steam dark background
	c.fill(27, 40, 56);

	// Trophy body (trapezoidal cup)
	const [R, G, B] = [212, 175, 55]; // gold
	const cx = c.w / 2;

	const cupT = s(c, 0.10), cupB = s(c, 0.56);
	const cupTW = s(c, 0.68), cupBW = s(c, 0.42);
	c.fillPoly([
		[cx - cupTW / 2, cupT], [cx + cupTW / 2, cupT],
		[cx + cupBW / 2, cupB], [cx - cupBW / 2, cupB],
	], R, G, B);

	// Inner cup cutout (dark, gives depth)
	const inset = s(c, 0.06);
	c.fillPoly([
		[cx - cupTW / 2 + inset, cupT + inset], [cx + cupTW / 2 - inset, cupT + inset],
		[cx + cupBW / 2 - inset * 0.6, cupB - s(c, 0.08)],
		[cx - cupBW / 2 + inset * 0.6, cupB - s(c, 0.08)],
	], 27, 40, 56);

	// Left handle bump
	c.fillCircle(cx - cupTW / 2 - s(c, 0.02), cupT + (cupB - cupT) * 0.28, s(c, 0.08), R, G, B);
	// Right handle bump
	c.fillCircle(cx + cupTW / 2 + s(c, 0.02), cupT + (cupB - cupT) * 0.28, s(c, 0.08), R, G, B);

	// Stem
	const stemW = s(c, 0.11);
	c.fillRect(Math.round(cx - stemW / 2), Math.round(cupB), Math.round(stemW), Math.round(s(c, 0.14)), R, G, B);

	// Base
	const baseW = s(c, 0.56), baseH = s(c, 0.09);
	c.fillRect(Math.round(cx - baseW / 2), Math.round(cupB + s(c, 0.14)), Math.round(baseW), Math.round(baseH), R, G, B);

	// Steam circle in top-right corner
	const scx = cx + s(c, 0.28), scy = s(c, 0.14), sr = s(c, 0.12);
	c.drawRing(scx, scy, sr, sr * 0.55, 77, 139, 217); // Steam blue

	// Star at top center of trophy
	const starPts = starPoints(cx, cupT - s(c, 0.04), s(c, 0.10), s(c, 0.05));
	c.fillPoly(starPts, 255, 225, 100);
}

/** Dashboard: 3 ascending bar chart */
function drawDashboardIcon(c: Canvas): void {
	const [R, G, B] = [70, 130, 180];
	const barW = Math.max(2, Math.round(s(c, 0.18)));
	const gap   = Math.max(1, Math.round(s(c, 0.07)));
	const total = 3 * barW + 2 * gap;
	const startX = Math.round((c.w - total) / 2);
	const heights = [0.34, 0.56, 0.82];
	const baseY = Math.round(c.h * 0.90);

	for (let i = 0; i < 3; i++) {
		const bh = Math.max(2, Math.round(s(c, heights[i])));
		const bx = startX + i * (barW + gap);
		c.fillRect(bx, baseY - bh, barW, bh, R, G, B);
	}
	// baseline
	c.fillRect(startX - 1, baseY, total + 2, Math.max(1, Math.round(s(c, 0.06))), R, G, B);
}

/** Radar: circle + center dot (crosshair scan) */
function drawRadarIcon(c: Canvas): void {
	const [R, G, B] = [218, 165, 32]; // gold
	const cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5;
	const outer = s(c, 0.43), inner = s(c, 0.31);
	c.drawRing(cx, cy, outer, inner, R, G, B);

	// Cross lines
	const arm = s(c, 0.42), t = Math.max(1, Math.round(s(c, 0.055)));
	c.fillRect(Math.round(cx - t / 2), Math.round(cy - arm), Math.max(1, t), Math.round(arm * 2), R, G, B, 100);
	c.fillRect(Math.round(cx - arm), Math.round(cy - t / 2), Math.round(arm * 2), Math.max(1, t), R, G, B, 100);

	// Center dot
	c.fillCircle(cx, cy, s(c, 0.10), R, G, B);
	// Trophy dot (small achievement symbol in center)
	c.fillCircle(cx, cy, s(c, 0.05), 255, 255, 255);
}

/** Grid Cell: 3×3 grid of small squares (represents achievement grid) */
function drawGridCellIcon(c: Canvas): void {
	const [R, G, B] = [168, 85, 247]; // purple
	const tile = Math.max(2, Math.round(s(c, 0.24)));
	const gap  = Math.max(1, Math.round(s(c, 0.048)));
	const total = 3 * tile + 2 * gap;
	const ox = Math.round((c.w - total) / 2);
	const oy = Math.round((c.h - total) / 2);

	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			const x = ox + col * (tile + gap);
			const y = oy + row * (tile + gap);
			const alpha = (row === 0 && col === 1) ? 255 : (row === 1 || col === 1) ? 200 : 155;
			c.fillRect(x, y, tile, tile, R, G, B, alpha);
			// Trophy icon on center tile
			if (row === 0 && col === 1) {
				const tx = x + Math.round(tile * 0.5);
				const ty = y + Math.round(tile * 0.3);
				c.fillCircle(tx, ty, tile * 0.22, 255, 255, 255, 200);
			}
		}
	}
}

/** Grid Nav: right-pointing triangle arrow */
function drawGridNavIcon(c: Canvas): void {
	const [R, G, B] = [156, 163, 175]; // gray
	const cx = c.w / 2, cy = c.h / 2;
	const ax = s(c, 0.26), h = s(c, 0.38);
	// Right chevron (>)
	c.fillPoly([
		[cx - ax * 0.3, cy - h], [cx + ax * 0.8, cy], [cx - ax * 0.3, cy + h],
	], R, G, B);
}

/** Grid Info: progress ring + "i" symbol */
function drawGridInfoIcon(c: Canvas): void {
	const [R, G, B] = [59, 130, 246]; // blue
	const cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5;
	// Partial ring (270°, to show progress)
	c.drawRing(cx, cy, s(c, 0.42), s(c, 0.30), R, G, B);

	// "i" stem
	const stemW = Math.max(2, Math.round(s(c, 0.12)));
	const stemH = Math.round(s(c, 0.28));
	const stemX = Math.round(cx - stemW / 2), stemY = Math.round(cy - stemH * 0.1);
	c.fillRect(stemX, stemY, stemW, stemH, 255, 255, 255, 220);

	// "i" dot
	c.fillCircle(cx, cy - s(c, 0.20), s(c, 0.09), 255, 255, 255, 220);
}

/** Game Browser: Steam-inspired icon (circle with arrow/load symbol) */
function drawGameBrowserIcon(c: Canvas): void {
	const [R, G, B] = [34, 197, 94]; // green
	const cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5;
	// Outer filled circle
	c.fillCircle(cx, cy, s(c, 0.43), R, G, B);
	// Steam-like concentric circles (inner darker cutout)
	c.fillCircle(cx, cy, s(c, 0.30), 15, 30, 20);
	// Controller D-pad: plus shape
	const arm = s(c, 0.12), t = s(c, 0.07);
	c.fillRect(Math.round(cx - t), Math.round(cy - arm), Math.round(t * 2), Math.round(arm * 2), R, G, B);
	c.fillRect(Math.round(cx - arm), Math.round(cy - t), Math.round(arm * 2), Math.round(t * 2), R, G, B);
}

/** Daily Pick: 5-pointed star */
function drawDailyPickIcon(c: Canvas): void {
	const [R, G, B] = [245, 158, 11]; // amber
	const cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5;
	c.fillPoly(starPoints(cx, cy, s(c, 0.44), s(c, 0.19)), R, G, B);
}

/** Generate 10-point star polygon */
function starPoints(cx: number, cy: number, outerR: number, innerR: number): [number, number][] {
	const pts: [number, number][] = [];
	for (let i = 0; i < 10; i++) {
		const angle = (i * Math.PI / 5) - Math.PI / 2;
		const r = i % 2 === 0 ? outerR : innerR;
		pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
	}
	return pts;
}

/** Settings: gear icon with a center hole */
function drawSettingsIcon(c: Canvas): void {
	const [R, G, B] = [34, 197, 94]; // green — matches status feedback color
	const cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5;
	const outer = s(c, 0.42), inner = s(c, 0.27), hole = s(c, 0.13);

	// Draw 8 gear teeth
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		const a1 = a - 0.25, a2 = a + 0.25;
		c.fillPoly([
			[cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner],
			[cx + Math.cos(a1) * outer, cy + Math.sin(a1) * outer],
			[cx + Math.cos(a2) * outer, cy + Math.sin(a2) * outer],
			[cx + Math.cos(a2) * inner, cy + Math.sin(a2) * inner],
		], R, G, B);
	}

	// Gear body ring
	c.drawRing(cx, cy, inner, hole, R, G, B);

	// Center hole (transparent — draws background color)
	c.fillCircle(cx, cy, hole, 27, 40, 56);
}

/** Profile Launcher: two overlapping rectangles with a forward arrow */
function drawProfileLauncherIcon(c: Canvas): void {
	const [R, G, B] = [34, 197, 94]; // green
	const cx = c.w / 2 - 0.5, cy = c.h / 2 - 0.5;

	// Back page (offset slightly up-left)
	const pw = s(c, 0.5), ph = s(c, 0.62);
	const bx = cx - pw * 0.65, by = cy - ph * 0.35;
	for (let dy = 0; dy < Math.round(ph); dy++) {
		for (let dx = 0; dx < Math.round(pw); dx++) {
			c.setPixel(Math.round(bx + dx), Math.round(by + dy), R, G, B, 80);
		}
	}

	// Front page
	const fx = cx - pw * 0.2, fy = cy - ph * 0.65;
	for (let dy = 0; dy < Math.round(ph); dy++) {
		for (let dx = 0; dx < Math.round(pw); dx++) {
			c.setPixel(Math.round(fx + dx), Math.round(fy + dy), R, G, B, 220);
		}
	}

	// Arrow pointing right (→) on front page
	const ax = Math.round(fx + pw * 0.35), ay = Math.round(fy + ph * 0.5);
	const ah = Math.max(1, Math.round(s(c, 0.06)));
	c.fillRect(Math.round(ax - s(c, 0.14)), ay - ah, Math.round(s(c, 0.18)), ah * 2, 27, 40, 56, 255);
	c.fillPoly([
		[ax, ay - s(c, 0.12)],
		[ax + s(c, 0.14), ay],
		[ax, ay + s(c, 0.12)],
	], 27, 40, 56, 255);
}

// ── File list ────────────────────────────────────────────────────────────────

const SD = "com.maxik.steam-achievements.sdPlugin";

type IconSpec = {
	path: string;
	w: number;
	h: number;
	draw: (c: Canvas) => void;
};

function icon(base: string, w: number, h: number, draw: (c: Canvas) => void): IconSpec[] {
	return [
		{ path: `${SD}/${base}.png`,    w,          h,          draw },
		{ path: `${SD}/${base}@2x.png`, w: w * 2,   h: h * 2,   draw },
	];
}

const files: IconSpec[] = [
	...icon("imgs/plugin/category-icon",               28,  28,  drawPluginIcon),
	...icon("imgs/plugin/marketplace",                 288, 288, drawPluginIcon),

	...icon("imgs/actions/dashboard/icon",             20,  20,  drawDashboardIcon),
	...icon("imgs/actions/dashboard/key",              72,  72,  drawDashboardIcon),

	...icon("imgs/actions/radar/icon",                 20,  20,  drawRadarIcon),
	...icon("imgs/actions/radar/key",                  72,  72,  drawRadarIcon),

	...icon("imgs/actions/grid-cell/icon",             20,  20,  drawGridCellIcon),
	...icon("imgs/actions/grid-cell/key",              72,  72,  drawGridCellIcon),

	...icon("imgs/actions/grid-nav/icon",              20,  20,  drawGridNavIcon),
	...icon("imgs/actions/grid-nav/key",               72,  72,  drawGridNavIcon),

	...icon("imgs/actions/grid-info/icon",             20,  20,  drawGridInfoIcon),
	...icon("imgs/actions/grid-info/key",              72,  72,  drawGridInfoIcon),

	...icon("imgs/actions/game-browser/icon",          20,  20,  drawGameBrowserIcon),
	...icon("imgs/actions/game-browser/key",           72,  72,  drawGameBrowserIcon),

	...icon("imgs/actions/daily-pick/icon",            20,  20,  drawDailyPickIcon),
	...icon("imgs/actions/daily-pick/key",             72,  72,  drawDailyPickIcon),

	...icon("imgs/actions/settings/icon",              20,  20,  drawSettingsIcon),
	...icon("imgs/actions/settings/key",               72,  72,  drawSettingsIcon),

	...icon("imgs/actions/profile-launcher/icon",      20,  20,  drawProfileLauncherIcon),
	...icon("imgs/actions/profile-launcher/key",       72,  72,  drawProfileLauncherIcon),
];

for (const f of files) {
	const c = new Canvas(f.w, f.h);
	f.draw(c);
	writeFileSync(f.path, c.toPng());
	console.log(`✔ ${f.path}  (${f.w}×${f.h})`);
}

console.log("\nDone — icons generated.");
