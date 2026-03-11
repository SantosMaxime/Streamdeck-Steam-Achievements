/**
 * Device → bundled profile mapping.
 *
 * Maps a Stream Deck device type number to the bundled grid profile name
 * (as declared in manifest.json), the number of achievement cell slots
 * visible on one page, and the number of columns in the achievement grid.
 *
 * Shared by GameBrowser, ProfileLauncher, and GridCell actions.
 */

export const DEVICE_PROFILE: Record<number, { profile: string; pageSize: number; cols: number }> = {
	0: { profile: "profiles/grid-standard", pageSize: 10, cols: 5 },  // Standard 5×3
	1: { profile: "profiles/grid-mini",     pageSize: 3,  cols: 3 },  // Mini 3×2
	2: { profile: "profiles/grid-xl",       pageSize: 24, cols: 8 },  // XL 8×4
	7: { profile: "profiles/grid-plus",     pageSize: 4,  cols: 4 },  // Stream Deck +
	9: { profile: "profiles/grid-plus",     pageSize: 4,  cols: 4 },  // Neo 4×2
};
