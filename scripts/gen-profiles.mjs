/**
 * Generates bundled .streamDeckProfile files for the plugin.
 *
 * Each bundle is a ZIP containing a UUID-named .sdProfile directory with:
 *   - UUID.sdProfile/             (root directory entry)
 *   - UUID.sdProfile/col,row/     (one per action)
 *   - UUID.sdProfile/col,row/CustomImages/
 *   - UUID.sdProfile/manifest.json
 *
 * Run with:  node scripts/gen-profiles.mjs
 */

import * as fs from "fs";
import * as path from "path";
import { deflateRawSync } from "zlib";

// ── Profile action helpers ────────────────────────────────

function makeAction(uuid, name, settings = null) {
	return {
		Name: name,
		Settings: settings,
		State: 0,
		States: [{ FFamily: "", FSize: "", FStyle: "", FUnderline: "", Image: "", Title: "", TitleAlignment: "", TitleColor: "", TitleShow: "" }],
		UUID: uuid,
	};
}

const CELL  = "com.maxik.steam-achievements.grid-cell";
const PREV  = "com.maxik.steam-achievements.grid-prev";
const NEXT  = "com.maxik.steam-achievements.grid-next";
const BACK  = "com.maxik.steam-achievements.grid-back";
const INFO  = "com.maxik.steam-achievements.grid-info";
const BROWS = "com.maxik.steam-achievements.game-browser";

const cell = (slot) => makeAction(CELL, "Achievement", { slotIndex: slot });
const nav  = (uuid, n) => makeAction(uuid, n);

// ── Profile definitions ───────────────────────────────────

const profiles = [
	{
		filename:    "grid-standard",
		deviceModel: "20GAA9901",
		uuid:        "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
		actions: {
			"0,0": cell(0), "1,0": cell(1), "2,0": cell(2), "3,0": cell(3), "4,0": cell(4),
			"0,1": cell(5), "1,1": cell(6), "2,1": cell(7), "3,1": cell(8), "4,1": cell(9),
			"0,2": nav(BACK,  "Grid Back"),
			"1,2": nav(PREV,  "Grid Prev"),
			"2,2": nav(INFO,  "Grid Info"),
			"3,2": nav(NEXT,  "Grid Next"),
			"4,2": nav(BROWS, "Game Browser"),
		},
	},
	{
		filename:    "grid-mini",
		deviceModel: "20GAI9901",
		uuid:        "B2C3D4E5-F6A7-8901-BCDE-F12345678901",
		actions: {
			"0,0": cell(0), "1,0": cell(1), "2,0": cell(2),
			"0,1": nav(BACK, "Grid Back"),
			"1,1": nav(INFO, "Grid Info"),
			"2,1": nav(NEXT, "Grid Next"),
		},
	},
	{
		filename:    "grid-xl",
		deviceModel: "20GAT9901",
		uuid:        "C3D4E5F6-A7B8-9012-CDEF-123456789012",
		actions: {
			...Object.fromEntries(
				Array.from({ length: 24 }, (_, i) => [`${i % 8},${Math.floor(i / 8)}`, cell(i)])
			),
			"0,3": nav(BACK,  "Grid Back"),
			"1,3": nav(PREV,  "Grid Prev"),
			"4,3": nav(INFO,  "Grid Info"),
			"6,3": nav(NEXT,  "Grid Next"),
			"7,3": nav(BROWS, "Game Browser"),
		},
	},
	{
		filename:    "grid-plus",
		deviceModel: "20GCA0901",
		uuid:        "D4E5F6A7-B8C9-0123-DEF0-234567890123",
		actions: {
			"0,0": cell(0), "1,0": cell(1), "2,0": cell(2), "3,0": cell(3),
			"0,1": nav(BACK, "Grid Back"),
			"1,1": nav(PREV, "Grid Prev"),
			"2,1": nav(INFO, "Grid Info"),
			"3,1": nav(NEXT, "Grid Next"),
		},
	},
];

// ── Minimal ZIP writer ────────────────────────────────────

function writeUInt16LE(buf, offset, val) { buf.writeUInt16LE(val, offset); }
function writeUInt32LE(buf, offset, val) { buf.writeUInt32LE(val >>> 0, offset); }

/** Simple CRC-32 table */
const crcTable = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		t[i] = c;
	}
	return t;
})();

function crc32(data) {
	let c = 0xFFFFFFFF;
	for (const b of data) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
	return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Create a ZIP buffer from a list of { name: string, data?: Buffer } entries.
 * entries with a name ending in '/' are stored as directories (empty data, no compression).
 */
function createZip(entries) {
	const localHeaders = [];
	const parts = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = Buffer.from(entry.name, "utf8");
		const isDir = entry.name.endsWith("/");
		const rawData = isDir ? Buffer.alloc(0) : (entry.data ?? Buffer.alloc(0));
		const compressed = isDir ? rawData : deflateRawSync(rawData, { level: 6 });
		const useDef = !isDir && compressed.length < rawData.length;
		const fileData = useDef ? compressed : rawData;
		const method = useDef ? 8 : 0;
		const crc = isDir ? 0 : crc32(rawData);

		// Local file header
		const lh = Buffer.alloc(30 + nameBytes.length);
		lh.writeUInt32LE(0x04034b50, 0);  // signature
		writeUInt16LE(lh, 4, 20);          // version needed
		lh.fill(0, 6, 8);                  // flags
		writeUInt16LE(lh, 8, method);       // compression
		lh.fill(0, 10, 14);                // mod time/date
		writeUInt32LE(lh, 14, crc);         // CRC-32
		writeUInt32LE(lh, 18, fileData.length); // compressed size
		writeUInt32LE(lh, 22, rawData.length);  // uncompressed size
		writeUInt16LE(lh, 26, nameBytes.length); // filename length
		writeUInt16LE(lh, 28, 0);           // extra field length
		nameBytes.copy(lh, 30);

		localHeaders.push({ nameBytes, method, crc, compSize: fileData.length, uncompSize: rawData.length, offset });
		parts.push(lh, fileData);
		offset += lh.length + fileData.length;
	}

	// Central directory
	const cdStart = offset;
	for (const info of localHeaders) {
		const cd = Buffer.alloc(46 + info.nameBytes.length);
		cd.writeUInt32LE(0x02014b50, 0);    // signature
		writeUInt16LE(cd, 4, 20);            // version made by
		writeUInt16LE(cd, 6, 20);            // version needed
		cd.fill(0, 8, 12);                   // flags + compression (already set below)
		writeUInt16LE(cd, 10, info.method);  // compression
		cd.fill(0, 12, 16);                  // time/date
		writeUInt32LE(cd, 16, info.crc);
		writeUInt32LE(cd, 20, info.compSize);
		writeUInt32LE(cd, 24, info.uncompSize);
		writeUInt16LE(cd, 28, info.nameBytes.length);
		writeUInt16LE(cd, 30, 0);            // extra len
		writeUInt16LE(cd, 32, 0);            // comment len
		writeUInt16LE(cd, 34, 0);            // disk start
		writeUInt16LE(cd, 36, 0);            // int attrs
		cd.writeUInt32LE(0, 38);             // ext attrs
		writeUInt32LE(cd, 42, info.offset);  // local header offset
		info.nameBytes.copy(cd, 46);
		parts.push(cd);
		offset += cd.length;
	}
	const cdSize = offset - cdStart;

	// End of central directory
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	writeUInt16LE(eocd, 4, 0);                 // disk number
	writeUInt16LE(eocd, 6, 0);                 // disk with CD
	writeUInt16LE(eocd, 8, localHeaders.length);
	writeUInt16LE(eocd, 10, localHeaders.length);
	writeUInt32LE(eocd, 12, cdSize);
	writeUInt32LE(eocd, 16, cdStart);
	writeUInt16LE(eocd, 20, 0);                // comment length
	parts.push(eocd);

	return Buffer.concat(parts);
}

// ── Build each profile ────────────────────────────────────

const outDir = path.resolve("com.maxik.steam-achievements.sdPlugin/profiles");

for (const profile of profiles) {
	const sdProfile = `${profile.uuid}.sdProfile`;

	// Build manifest
	const manifest = JSON.stringify({
		Actions: profile.actions,
		DeviceModel: profile.deviceModel,
		InstalledByPluginUUID: "com.maxik.steam-achievements",
		Name: "Steam Achievement Grid",
		PreconfiguredName: "Steam Achievement Grid",
		Version: "1.0",
	}, null, "\t");

	// Collect ZIP entries
	const entries = [];
	entries.push({ name: `${sdProfile}/` }); // root dir
	for (const coord of Object.keys(profile.actions)) {
		entries.push({ name: `${sdProfile}/${coord}/` });
		entries.push({ name: `${sdProfile}/${coord}/CustomImages/` });
	}
	entries.push({ name: `${sdProfile}/manifest.json`, data: Buffer.from(manifest, "utf8") });

	const zipBuf = createZip(entries);
	const outPath = path.join(outDir, `${profile.filename}.streamDeckProfile`);
	fs.writeFileSync(outPath, zipBuf);
	console.log(`✔ ${profile.filename}.streamDeckProfile (${entries.length} entries, ${zipBuf.length} bytes)`);
}

console.log("Done.");
