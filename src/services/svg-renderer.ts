/**
 * SVG Image Factory for Stream Deck keys.
 *
 * Generates 144×144 SVG strings (@2x resolution for Stream Deck keys).
 * All SVGs are self-contained data URIs that can be passed to `setImage()`.
 *
 * Rarity color scale:
 *   > 50%   Common        #6b7280 (gray)
 *   20–50%  Uncommon      #22c55e (green)
 *   5–20%   Rare          #3b82f6 (blue)
 *   1–5%    Ultra Rare    #a855f7 (purple)
 *   < 1%    Legendary     #f59e0b (gold)
 */

const SIZE = 144;

// ── Rarity helpers ─────────────────────────────────────────

export interface RarityInfo {
	color: string;
	label: string;
}

export function getRarityInfo(pct: number): RarityInfo {
	if (pct < 0) return { color: "#6b7280", label: "???" };
	if (pct < 1) return { color: "#f59e0b", label: "Legendary" };
	if (pct < 5) return { color: "#a855f7", label: "Ultra Rare" };
	if (pct < 20) return { color: "#3b82f6", label: "Rare" };
	if (pct < 50) return { color: "#22c55e", label: "Uncommon" };
	return { color: "#6b7280", label: "Common" };
}

function svgToDataUri(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ── Renderers ──────────────────────────────────────────────

/**
 * Locked achievement cell: embedded image with gray overlay + rarity color strip at the bottom.
 */
export function renderLockedCell(iconBase64: string, rarityPct: number): string {
	const { color } = getRarityInfo(rarityPct);
	const stripH = 6;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <image href="${escapeXml(iconBase64)}" x="16" y="10" width="112" height="112" opacity="0.5"/>
  <rect x="0" y="${SIZE - stripH}" width="${SIZE}" height="${stripH}" fill="${color}" rx="0"/>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="none" stroke="#333" stroke-width="2" rx="8"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Unlocked achievement cell: full-color image + rarity border glow.
 */
export function renderUnlockedCell(iconBase64: string, rarityPct: number): string {
	const { color } = getRarityInfo(rarityPct);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="glow">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${color}" flood-opacity="0.8"/>
    </filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <image href="${escapeXml(iconBase64)}" x="16" y="10" width="112" height="112"/>
  <rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" fill="none" stroke="${color}" stroke-width="3" rx="8" filter="url(#glow)"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Celebration frame — golden glow that alternates intensity (frame 0 or 1).
 */
export function renderCelebrationCell(iconBase64: string, frame: 0 | 1): string {
	const glowSize = frame === 0 ? 4 : 7;
	const opacity = frame === 0 ? "0.8" : "1";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="celebglow">
      <feDropShadow dx="0" dy="0" stdDeviation="${glowSize}" flood-color="#f59e0b" flood-opacity="${opacity}"/>
    </filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <image href="${escapeXml(iconBase64)}" x="16" y="10" width="112" height="112" filter="url(#celebglow)"/>
  <rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" fill="none" stroke="#f59e0b" stroke-width="3" rx="8" filter="url(#celebglow)"/>
  <text x="${SIZE / 2}" y="${SIZE - 8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#f59e0b">🏆 UNLOCKED</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Circular progress ring for Grid Info display.
 */
export function renderProgressRing(pct: number, gameImageBase64?: string): string {
	const cx = SIZE / 2;
	const cy = SIZE / 2;
	const r = 50;
	const circumference = 2 * Math.PI * r;
	const offset = circumference * (1 - pct / 100);

	const color = pct === 100 ? "#f59e0b" : pct >= 75 ? "#22c55e" : pct >= 50 ? "#3b82f6" : "#6b7280";

	const gameImg = gameImageBase64
		? `<image href="${escapeXml(gameImageBase64)}" x="32" y="32" width="80" height="80" clip-path="circle(36px at 40px 40px)" opacity="0.3"/>`
		: "";

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  ${gameImg}
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#333" stroke-width="8"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
    stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
  <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="white">${pct}%</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Empty slot placeholder.
 */
export function renderEmptyCell(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#0f0f1a" rx="8"/>
  <rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" fill="none" stroke="#222" stroke-width="1" stroke-dasharray="8 4" rx="6"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Navigation button SVGs (prev, next, back).
 */
export function renderNavButton(type: "prev" | "next" | "back"): string {
	let inner: string;

	if (type === "prev") {
		// Left chevron
		inner = `<polygon points="90,30 50,72 90,114" fill="#ccc"/>`;
	} else if (type === "next") {
		// Right chevron
		inner = `<polygon points="54,30 94,72 54,114" fill="#ccc"/>`;
	} else {
		// Back arrow (home icon)
		inner = `
    <polygon points="72,28 28,72 50,72 50,116 94,116 94,72 116,72" fill="none" stroke="#ccc" stroke-width="4" stroke-linejoin="round"/>
    <rect x="62" y="88" width="20" height="28" fill="#ccc" rx="2"/>`;
	}

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  ${inner}
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Game browser button — controller icon.
 */
export function renderGameBrowserKey(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <rect x="24" y="40" width="96" height="64" rx="12" fill="none" stroke="#3b82f6" stroke-width="3"/>
  <circle cx="52" cy="72" r="8" fill="#3b82f6"/>
  <line x1="84" y1="60" x2="84" y2="84" stroke="#3b82f6" stroke-width="3"/>
  <line x1="72" y1="72" x2="96" y2="72" stroke="#3b82f6" stroke-width="3"/>
  <text x="${SIZE / 2}" y="126" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#888">GAMES</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Daily pick — star icon.
 */
export function renderDailyPickKey(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <polygon points="72,20 84,56 122,56 90,78 102,114 72,92 42,114 54,78 22,56 60,56"
    fill="#f59e0b" stroke="#f59e0b" stroke-width="1"/>
  <text x="${SIZE / 2}" y="138" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#888">DAILY PICK</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Settings key — gear icon with status text.
 * state: "configured" (green), "unconfigured" (gray), "testing" (amber), "error" (red)
 */
export function renderSettingsKey(state: "configured" | "unconfigured" | "testing" | "error"): string {
	const colors = {
		configured:   { ring: "#22c55e", text: "#22c55e", label: "Configured ✓" },
		unconfigured: { ring: "#6b7280", text: "#6b7280", label: "Not Configured" },
		testing:      { ring: "#f59e0b", text: "#f59e0b", label: "Testing…" },
		error:        { ring: "#ef4444", text: "#ef4444", label: "Error" },
	};
	const { ring, text, label } = colors[state];
	const cx = SIZE / 2, cy = 58;
	// Gear teeth: 8 rectangular prongs around the ring
	const teeth = Array.from({ length: 8 }, (_, i) => {
		const a = (i / 8) * Math.PI * 2;
		const a1 = a - 0.18, a2 = a + 0.18;
		const ri = 22, ro = 32;
		return `M${cx + Math.cos(a1) * ri},${cy + Math.sin(a1) * ri} ` +
			`L${cx + Math.cos(a1) * ro},${cy + Math.sin(a1) * ro} ` +
			`A${ro},${ro},0,0,1,${cx + Math.cos(a2) * ro},${cy + Math.sin(a2) * ro} ` +
			`L${cx + Math.cos(a2) * ri},${cy + Math.sin(a2) * ri} ` +
			`A${ri},${ri},0,0,0,${cx + Math.cos(a1) * ri},${cy + Math.sin(a1) * ri}Z`;
	}).join(" ");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="${ring}" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="9" fill="${ring}"/>
  <path d="${escapeXml(teeth)}" fill="${ring}"/>
  <text x="${cx}" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="${text}">${escapeXml(label)}</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Profile launcher key — two overlapping pages with a right-arrow to indicate switching.
 */
export function renderProfileLauncherKey(label: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <rect x="28" y="30" width="64" height="72" rx="6" fill="none" stroke="#22c55e" stroke-width="2" opacity="0.5"/>
  <rect x="44" y="22" width="64" height="72" rx="6" fill="#1a1a2e" stroke="#22c55e" stroke-width="3"/>
  <line x1="58" y1="58" x2="88" y2="58" stroke="#22c55e" stroke-width="4" stroke-linecap="round"/>
  <polygon points="84,50 96,58 84,66" fill="#22c55e"/>
  <text x="${SIZE / 2 + 4}" y="114" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#22c55e">${escapeXml(label)}</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Game tile — shown when the grid is in "games" mode.
 * Splits the game name across two lines and shows a teal border.
 */
export function renderGameCell(name: string): string {
	let l1 = name, l2 = "";
	if (name.length > 13) {
		const mid = Math.floor(name.length / 2);
		const split = name.lastIndexOf(" ", mid) > 0 ? name.lastIndexOf(" ", mid) : name.indexOf(" ", mid);
		if (split > 0) {
			l1 = name.slice(0, split);
			l2 = name.slice(split + 1);
			if (l2.length > 14) l2 = l2.slice(0, 13) + "…";
		} else {
			l1 = name.slice(0, 13) + "…";
		}
	}
	if (l1.length > 14) l1 = l1.slice(0, 13) + "…";

	const cy = l2 ? 64 : 72;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1a1a2e" rx="8"/>
  <rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" fill="none" stroke="#0d9488" stroke-width="2" rx="8"/>
  <text x="${SIZE / 2}" y="${cy}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#e2e8f0">${escapeXml(l1)}</text>
  ${l2 ? `<text x="${SIZE / 2}" y="${cy + 18}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#e2e8f0">${escapeXml(l2)}</text>` : ""}
  <text x="${SIZE / 2}" y="130" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#0d9488">CLICK TO LOAD</text>
</svg>`;
	return svgToDataUri(svg);
}
