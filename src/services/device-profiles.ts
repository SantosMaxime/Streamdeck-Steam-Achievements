/**
 * Device → bundled profile mapping.
 *
 * Maps a Stream Deck device type number to the bundled grid profile name
 * (as declared in manifest.json) and the number of achievement cell slots
 * visible on one page for that device layout.
 *
 * Shared by GameBrowser and ProfileLauncher actions.
 */

export const DEVICE_PROFILE: Record<number, { profile: string; pageSize: number }> = {
	0: { profile: "profiles/grid-standard", pageSize: 10 },  // Standard 5×3
	1: { profile: "profiles/grid-mini",     pageSize: 3  },  // Mini 3×2
	2: { profile: "profiles/grid-xl",       pageSize: 24 },  // XL 8×4
	7: { profile: "profiles/grid-plus",     pageSize: 4  },  // Stream Deck +
	9: { profile: "profiles/grid-plus",     pageSize: 4  },  // Neo 4×2
};
