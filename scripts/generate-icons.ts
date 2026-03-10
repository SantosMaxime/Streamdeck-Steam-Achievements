/**
 * One-shot script: generates placeholder PNG icons for the Stream Deck plugin.
 * Run once with: node --experimental-strip-types scripts/generate-icons.ts
 * or:            npx tsx scripts/generate-icons.ts
 *
 * Required sizes (Stream Deck SDK):
 *   Plugin marketplace icon : 288×288
 *   Category icon           :  28×28
 *   Action list icon        :  20×20
 *   Key default image       :  72×72
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ── Minimal PNG encoder (pure Node.js, no deps) ────────────────────────────

function crc32(buf: Buffer): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < buf.length; i++) {
		crc ^= buf[i];
		for (let j = 0; j < 8; j++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
		}
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const t = Buffer.from(type, "ascii");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
	return Buffer.concat([len, t, data, crc]);
}

/** Create a solid-color PNG image (RGBA). */
function createPng(w: number, h: number, r: number, g: number, b: number, a = 255): Buffer {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	// IHDR
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;  // bit depth
	ihdr[9] = 6;  // color type: RGBA

	// Raw image data: filter-byte + RGBA per pixel, per row
	const raw = Buffer.alloc(h * (1 + w * 4));
	for (let y = 0; y < h; y++) {
		const off = y * (1 + w * 4);
		raw[off] = 0; // filter: None
		for (let x = 0; x < w; x++) {
			const px = off + 1 + x * 4;
			raw[px]     = r;
			raw[px + 1] = g;
			raw[px + 2] = b;
			raw[px + 3] = a;
		}
	}

	return Buffer.concat([
		sig,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw)),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

// ── Generate files ──────────────────────────────────────────────────────────

const SD = "com.maxik.steam-achievements.sdPlugin";

const files: { path: string; w: number; h: number; color: [number, number, number] }[] = [
	// Plugin icons
	{ path: `${SD}/imgs/plugin/marketplace.png`,      w: 288, h: 288, color: [46, 139, 87]   },  // sea green
	{ path: `${SD}/imgs/plugin/category-icon.png`,     w: 28,  h: 28,  color: [46, 139, 87]   },

	// Dashboard action
	{ path: `${SD}/imgs/actions/dashboard/icon.png`,   w: 20,  h: 20,  color: [70, 130, 180]  },  // steel blue
	{ path: `${SD}/imgs/actions/dashboard/key.png`,    w: 72,  h: 72,  color: [70, 130, 180]  },

	// Radar action
	{ path: `${SD}/imgs/actions/radar/icon.png`,       w: 20,  h: 20,  color: [218, 165, 32]  },  // goldenrod
	{ path: `${SD}/imgs/actions/radar/key.png`,        w: 72,  h: 72,  color: [218, 165, 32]  },
];

for (const f of files) {
	const png = createPng(f.w, f.h, ...f.color);
	writeFileSync(f.path, png);
	console.log(`✔ ${f.path}  (${f.w}×${f.h})`);
}

console.log("\nDone — placeholder PNGs generated.");
