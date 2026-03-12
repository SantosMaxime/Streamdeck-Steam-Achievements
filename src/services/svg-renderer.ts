/**
 * SVG Image Factory for Stream Deck keys.
 *
 * Generates 144×144 SVG strings (@2x resolution for Stream Deck keys).
 * All SVGs are self-contained data URIs that can be passed to `setImage()`.
 * No background rects — the Stream Deck software provides the dark background.
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
 * Locked achievement cell: dimmed icon + rarity color strip at the bottom.
 */
export function renderLockedCell(iconBase64: string, rarityPct: number): string {
	const { color } = getRarityInfo(rarityPct);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <image href="${escapeXml(iconBase64)}" x="12" y="8" width="120" height="120" opacity="0.4"/>
  <rect x="0" y="138" width="${SIZE}" height="6" fill="${color}"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Unlocked achievement cell: full-color icon + rarity color strip at the bottom.
 */
export function renderUnlockedCell(iconBase64: string, rarityPct: number): string {
	const { color } = getRarityInfo(rarityPct);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <image href="${escapeXml(iconBase64)}" x="12" y="8" width="120" height="120"/>
  <rect x="0" y="138" width="${SIZE}" height="6" fill="${color}"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Celebration frame — golden pulsing border (frame 0 or 1).
 */
export function renderCelebrationCell(iconBase64: string, frame: 0 | 1): string {
	const glowSize = frame === 0 ? 4 : 8;
	const borderW = frame === 0 ? 3 : 5;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="glow"><feDropShadow dx="0" dy="0" stdDeviation="${glowSize}" flood-color="#f59e0b" flood-opacity="1"/></filter>
  </defs>
  <image href="${escapeXml(iconBase64)}" x="12" y="8" width="120" height="120"/>
  <rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" fill="none" stroke="#f59e0b" stroke-width="${borderW}" filter="url(#glow)"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Circular progress ring for Grid Info display.
 */
export function renderProgressRing(pct: number): string {
	const cx = SIZE / 2;
	const cy = SIZE / 2;
	const r = 52;
	const circumference = 2 * Math.PI * r;
	const offset = circumference * (1 - pct / 100);
	const color = pct === 100 ? "#f59e0b" : pct >= 75 ? "#22c55e" : pct >= 50 ? "#3b82f6" : "#6b7280";

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2a2a2a" stroke-width="9"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="9"
    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
    stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
  <text x="${cx}" y="${cy + 9}" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="bold" fill="white">${pct}%</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Empty slot placeholder — minimal dashed outline.
 */
export function renderEmptyCell(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect x="6" y="6" width="${SIZE - 12}" height="${SIZE - 12}" fill="none" stroke="#2a2a2a" stroke-width="1" stroke-dasharray="6 4" rx="4"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Navigation button SVGs (prev, next, back).
 */
export function renderNavButton(type: "prev" | "next" | "back"): string {
	let inner: string;

	if (type === "prev") {
		inner = `<polyline points="88,30 48,72 88,114" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
	} else if (type === "next") {
		inner = `<polyline points="56,30 96,72 56,114" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
	} else {
		inner = `<path d="M24,74 L72,26 L120,74 M42,74 L42,118 L102,118 L102,74" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
	}

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${inner}
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Load Game button — controller icon in white.
 */
export function renderGameBrowserKey(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect x="20" y="44" width="104" height="62" rx="14" fill="none" stroke="white" stroke-width="5"/>
  <circle cx="50" cy="72" r="8" fill="white"/>
  <line x1="90" y1="59" x2="90" y2="85" stroke="white" stroke-width="5" stroke-linecap="round"/>
  <line x1="77" y1="72" x2="103" y2="72" stroke="white" stroke-width="5" stroke-linecap="round"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Daily pick — gold star.
 */
export function renderDailyPickKey(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <polygon points="72,16 85,54 124,54 93,77 105,114 72,91 39,114 51,77 20,54 59,54" fill="#f59e0b"/>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Settings key — gear icon with status color.
 * state: "configured" (green), "unconfigured" (gray), "testing" (amber), "error" (red)
 */
export function renderSettingsKey(state: "configured" | "unconfigured" | "testing" | "error"): string {
	const colors = {
		configured:   { ring: "#22c55e", text: "#22c55e", label: "Configured" },
		unconfigured: { ring: "#6b7280", text: "#6b7280", label: "Not set up" },
		testing:      { ring: "#f59e0b", text: "#f59e0b", label: "Testing…" },
		error:        { ring: "#ef4444", text: "#ef4444", label: "Error" },
	};
	const { ring, text, label } = colors[state];
	const cx = SIZE / 2, cy = 56;
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
  <circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="${ring}" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="9" fill="${ring}"/>
  <path d="${escapeXml(teeth)}" fill="${ring}"/>
  <text x="${cx}" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="${text}">${escapeXml(label)}</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Profile launcher key — stacked pages with an arrow, in white.
 */
export function renderProfileLauncherKey(label: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect x="28" y="30" width="62" height="70" rx="5" fill="none" stroke="white" stroke-width="3" opacity="0.35"/>
  <rect x="44" y="22" width="62" height="70" rx="5" fill="none" stroke="white" stroke-width="4"/>
  <line x1="58" y1="58" x2="90" y2="58" stroke="white" stroke-width="4" stroke-linecap="round"/>
  <polyline points="82,48 94,58 82,68" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${SIZE / 2 + 4}" y="112" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="white">${escapeXml(label)}</text>
</svg>`;
	return svgToDataUri(svg);
}

/**
 * Game tile — shown when the grid is in "games" mode.
 * Displays Steam game image when available, falls back to white text.
 */
export function renderGameCell(name: string, imageDataUri: string | null = null): string {
	if (imageDataUri) {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <image href="${imageDataUri}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
		return svgToDataUri(svg);
	}

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
  <text x="${SIZE / 2}" y="${cy}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="white">${escapeXml(l1)}</text>
  ${l2 ? `<text x="${SIZE / 2}" y="${cy + 18}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="white">${escapeXml(l2)}</text>` : ""}
</svg>`;
	return svgToDataUri(svg);
}
