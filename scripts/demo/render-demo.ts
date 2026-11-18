/**
 * Renders the README demo GIF (docs/demo.gif).
 *
 * Every key image is produced by the plugin's real SVG renderer
 * (src/services/svg-renderer.ts); the game, achievements and icons are
 * fictional placeholders so the demo needs no Steam API key.
 *
 * Requirements (not project dependencies): Playwright with Chromium, and ffmpeg.
 *
 *   npx tsx scripts/demo/render-demo.ts
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	getRarityInfo,
	renderCelebrationCell,
	renderDailyPickKey,
	renderGameBrowserKey,
	renderLockedCell,
	renderNavButton,
	renderProfileLauncherKey,
	renderProgressRing,
	renderSettingsKey,
	renderUnlockedCell,
} from "../../src/services/svg-renderer";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const FPS = 15;
const DURATION = 17; // seconds
const WIDTH = 960;
const HEIGHT = 640;
const OUT = path.resolve("docs/demo.gif");

// ── Fictional achievement icons ─────────────────────────────

const GLYPHS: Record<string, string> = {
	flame: `<path d="M32 10c6 10 15 15 15 28a15 15 0 0 1-30 0c0-8 6-12 8-19 2 6 4 9 7 9 0-6-1-12 0-18z"/>`,
	mountain: `<path d="M8 48 26 22l9 12 6-8 15 22z"/>`,
	key: `<circle cx="22" cy="32" r="10" fill="none" stroke="#fff" stroke-width="6"/><path d="M31 29h24v6h-5v8h-6v-8h-13z"/>`,
	shield: `<path d="M32 10l17 6v15c0 11-7 19-17 23-10-4-17-12-17-23V16z"/>`,
	sword: `<path d="M44 10h10v10L30 44l-6-6z"/><path d="M16 36l12 12-4 4-4-4-6 6-4-4 6-6-4-4z"/>`,
	heart: `<path d="M32 52C13 40 10 29 16 21c5-6 13-5 16 2 3-7 11-8 16-2 6 8 3 19-16 31z"/>`,
	moon: `<path d="M38 10a22 22 0 1 0 16 34A17 17 0 1 1 38 10z"/>`,
	bolt: `<path d="M37 8 16 36h13l-4 20 23-30H34z"/>`,
	gem: `<path d="M18 24l7-10h14l7 10-14 28z"/>`,
	hourglass: `<path d="M18 10h28v4l-10 18 10 18v4H18v-4l10-18-10-18z"/>`,
	target: `<circle cx="32" cy="32" r="20" fill="none" stroke="#fff" stroke-width="5"/><circle cx="32" cy="32" r="10" fill="none" stroke="#fff" stroke-width="5"/><circle cx="32" cy="32" r="3"/>`,
	crown: `<path d="M12 44l4-24 9 11 7-15 7 15 9-11 4 24z"/><rect x="12" y="47" width="40" height="5" rx="1"/>`,
	compass: `<circle cx="32" cy="32" r="20" fill="none" stroke="#fff" stroke-width="5"/><path d="M40 24l-5 13-11 3 5-13z"/>`,
	leaf: `<path d="M14 50c0-22 14-34 38-36-2 22-14 36-38 36z"/>`,
	trophy: `<path d="M20 12h24v14a12 12 0 0 1-24 0z"/><path d="M12 14h8v6h-4c0 4 2 6 5 7l-2 4c-5-2-7-6-7-11zM52 14h-8v6h4c0 4-2 6-5 7l2 4c5-2 7-6 7-11z"/><rect x="29" y="37" width="6" height="8"/><rect x="21" y="45" width="22" height="6" rx="1"/>`,
	star: `<path d="M32 9l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 26l16-2z"/>`,
};

function icon(glyph: string, c1: string, c2: string, gray: boolean): string {
	const [a, b] = gray ? ["#4b5563", "#1f2937"] : [c1, c2];
	const fill = gray ? "#9ca3af" : "#fff";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="64" height="64" rx="6" fill="url(#g)"/>
<rect x="3" y="3" width="58" height="58" rx="4" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
<g fill="${fill}" stroke="none">${GLYPHS[glyph].replaceAll("#fff", fill)}</g></svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

interface Ach { id: string; name: string; pct: number; unlocked: boolean; glyph: string; c: [string, string] }

const ACHIEVEMENTS: Ach[] = [
	{ id: "spark", name: "First Spark", pct: 92.1, unlocked: true, glyph: "flame", c: ["#f97316", "#7c2d12"] },
	{ id: "walker", name: "Hollow Walker", pct: 71.4, unlocked: true, glyph: "mountain", c: ["#64748b", "#1e293b"] },
	{ id: "keymaster", name: "Keymaster", pct: 55.0, unlocked: true, glyph: "key", c: ["#eab308", "#713f12"] },
	{ id: "resolve", name: "Steel Resolve", pct: 38.2, unlocked: true, glyph: "shield", c: ["#0ea5e9", "#0c4a6e"] },
	{ id: "blade", name: "Blade Dancer", pct: 24.7, unlocked: true, glyph: "sword", c: ["#ef4444", "#450a0a"] },
	{ id: "heart", name: "Heartbound", pct: 18.3, unlocked: false, glyph: "heart", c: ["#ec4899", "#500724"] },
	{ id: "moon", name: "Moonlit Path", pct: 12.6, unlocked: true, glyph: "moon", c: ["#6366f1", "#1e1b4b"] },
	{ id: "storm", name: "Storm Caller", pct: 9.4, unlocked: false, glyph: "bolt", c: ["#06b6d4", "#083344"] },
	{ id: "gem", name: "Gem Hoarder", pct: 6.8, unlocked: false, glyph: "gem", c: ["#10b981", "#022c22"] },
	{ id: "abyss", name: "Into the Abyss", pct: 3.2, unlocked: false, glyph: "hourglass", c: ["#a855f7", "#2e1065"] },
	{ id: "bullseye", name: "Bullseye", pct: 2.1, unlocked: false, glyph: "target", c: ["#f43f5e", "#4c0519"] },
	{ id: "crowned", name: "Crowned", pct: 0.6, unlocked: false, glyph: "crown", c: ["#f59e0b", "#451a03"] },
	{ id: "wayfinder", name: "Wayfinder", pct: 0.4, unlocked: false, glyph: "compass", c: ["#14b8a6", "#042f2e"] },
	{ id: "evergreen", name: "Evergreen", pct: 33.0, unlocked: true, glyph: "leaf", c: ["#22c55e", "#052e16"] },
	{ id: "champion", name: "Champion", pct: 0.2, unlocked: false, glyph: "trophy", c: ["#fbbf24", "#422006"] },
	{ id: "starborn", name: "Starborn", pct: 1.4, unlocked: false, glyph: "star", c: ["#38bdf8", "#172554"] },
];

const DEFAULT_ORDER = ACHIEVEMENTS.slice(0, 10).map((a) => a.id);
const RAREST_ORDER = [...ACHIEVEMENTS].sort((a, b) => a.pct - b.pct).slice(0, 10).map((a) => a.id);

const images: Record<string, string> = {};
for (const a of ACHIEVEMENTS) {
	const color = icon(a.glyph, a.c[0], a.c[1], false);
	const gray = icon(a.glyph, a.c[0], a.c[1], true);
	images[`ach:${a.id}:locked`] = renderLockedCell(gray, a.pct);
	images[`ach:${a.id}:unlocked`] = renderUnlockedCell(color, a.pct);
	images[`ach:${a.id}:gray`] = gray;
	images[`ach:${a.id}:cel0`] = renderCelebrationCell(color, 0);
	images[`ach:${a.id}:cel1`] = renderCelebrationCell(color, 1);
}
images["radar:idle"] = `data:image/png;base64,${fs.readFileSync("com.maxik.steam-achievements.sdPlugin/imgs/actions/radar/key@2x.png").toString("base64")}`;
images["daily"] = renderDailyPickKey();
images["browser"] = renderGameBrowserKey();
images["launcher"] = renderProfileLauncherKey("Grid");
images["settings"] = renderSettingsKey("configured");
images["prev"] = renderNavButton("prev");
images["next"] = renderNavButton("next");
images["back"] = renderNavButton("back");
images["ring48"] = renderProgressRing(48);
images["ring50"] = renderProgressRing(50);

const rarity = ["Legendary", "Ultra Rare", "Rare", "Uncommon", "Common"].map((label, i) => ({
	label,
	color: getRarityInfo([0.5, 3, 10, 30, 80][i]).color,
}));

const data = { images, achievements: ACHIEVEMENTS, DEFAULT_ORDER, RAREST_ORDER, rarity, FPS, DURATION };

// ── Page ────────────────────────────────────────────────────

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{font-family:Inter,sans-serif;color:#e6edf3;background:#0a0e14;
  background-image:radial-gradient(ellipse 70% 60% at 50% 62%,#16263a 0%,#0a0e14 70%)}
#cap{position:absolute;left:0;right:0;top:36px;text-align:center}
.cap{position:absolute;left:0;right:0}
.step{font:600 12px Inter;letter-spacing:.18em;color:#66c0f4;text-transform:uppercase}
.head{font:700 34px 'Inter Display',Inter;letter-spacing:-.02em;margin-top:10px;color:#fff}
.sub{font:400 16px Inter;color:#8b98a9;margin-top:8px}
#deck{position:absolute;left:${(WIDTH - 624) / 2}px;top:172px;width:624px;height:392px;border-radius:30px;
  background:linear-gradient(180deg,#1c1f24,#0f1114);border:1px solid #2a2e35;
  box-shadow:0 30px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06)}
.slot{position:absolute;width:96px;height:96px;border-radius:14px;background:#050506;
  box-shadow:inset 0 2px 6px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.05)}
.spr{position:absolute;width:96px;height:96px;border-radius:14px;overflow:hidden;background:#050506;will-change:transform}
.spr img{position:absolute;inset:0;width:96px;height:96px}
.spr .t{position:absolute;left:2px;right:2px;bottom:6px;text-align:center;font:700 11px/1.25 Inter;color:#fff;
  white-space:pre;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000}
.spr .t.mid{bottom:auto;top:50%;transform:translateY(-50%);font-size:12px}
.spr .t.big b{display:block;font:800 24px 'Inter Display',Inter;margin-top:2px}
.spr .t.big span{color:#8b98a9;font-size:10px;letter-spacing:.12em}
#bar{position:absolute;left:0;right:0;top:584px;height:36px}
.pill{position:absolute;left:50%;top:0;transform:translateX(-50%);height:36px;padding:0 16px;border-radius:18px;
  display:flex;align-items:center;gap:10px;white-space:nowrap;font:500 13px Inter;color:#c9d4e0;
  background:rgba(23,32,45,.9);border:1px solid #263447}
.dot{width:8px;height:8px;border-radius:4px}
.chip{display:flex;align-items:center;gap:6px;margin-right:6px}
.chip i{width:10px;height:10px;border-radius:2px;display:block}
.toast{border-color:#a855f7;background:linear-gradient(90deg,rgba(88,28,135,.55),rgba(23,32,45,.95))}
.toast img{width:22px;height:22px;border-radius:4px}
#end{position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#0a0e14;background-image:radial-gradient(ellipse 60% 50% at 50% 50%,#16263a 0%,#0a0e14 75%)}
#end h1{font:800 44px 'Inter Display',Inter;letter-spacing:-.03em;margin-top:22px}
#end p{font:400 17px Inter;color:#8b98a9;margin-top:10px}
#end .tags{display:flex;gap:10px;margin-top:26px}
#end .tags span{font:500 13px Inter;padding:7px 14px;border-radius:16px;border:1px solid #263447;color:#c9d4e0;background:#111a26}
</style></head><body>
<div id="cap"></div><div id="deck"></div><div id="bar"></div><div id="end"></div>
<script>
const D = ${JSON.stringify(data)};
const K = 96, G = 20, P = 30;
const deck = document.getElementById("deck");
for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
  const s = document.createElement("div"); s.className = "slot";
  s.style.left = (P + c * (K + G)) + "px"; s.style.top = (P + r * (K + G)) + "px"; deck.appendChild(s);
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const out = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// Scene boundaries (seconds)
const S = { home: 0, detect: 3.0, grid: 6.2, sort: 9.6, unlock: 12.2, end: 15.2 };

const sprites = {};
function sprite(id) {
  if (!sprites[id]) {
    const el = document.createElement("div"); el.className = "spr";
    el.innerHTML = '<img><div class="t"></div>'; deck.appendChild(el);
    sprites[id] = { el, img: el.querySelector("img"), t: el.querySelector(".t"), src: null, title: null, cls: null };
  }
  return sprites[id];
}
// Key press: quick dip in scale
const press = (t, at) => { const x = (t - at) / .28; return x < 0 || x > 1 ? 1 : 1 - .08 * Math.sin(Math.PI * x); };

function homeKeys(t) {
  const detected = t >= S.detect + .9;
  const k = [];
  const radarTitle = detected ? "Into the Abyss\\n23/48 (48%)" : "No game\\nrunning";
  k.push({ id: "radar", c: 0, r: 0, src: detected ? D.images["ach:abyss:gray"] : D.images["radar:idle"], title: radarTitle,
    pad: detected ? 0 : 22, lift: detected ? 0 : 12, scanning: !detected && t >= S.detect });
  k.push({ id: "lvl", c: 1, r: 0, big: ["STEAM LEVEL", "42"] });
  k.push({ id: "total", c: 2, r: 0, big: ["ACHIEVEMENTS", "1,284"] });
  k.push({ id: "perfect", c: 3, r: 0, big: ["PERFECT", "17/63"] });
  k.push({ id: "daily", c: 4, r: 0, src: detected ? D.images["ach:crowned:locked"] : D.images.daily, title: detected ? "Daily pick\\nCrowned" : "" });
  k.push({ id: "browser", c: 0, r: 1, src: D.images.browser, title: "" });
  k.push({ id: "launcher", c: 1, r: 1, src: D.images.launcher, title: "", press: S.grid - .35 });
  k.push({ id: "settings", c: 2, r: 1, src: D.images.settings, title: "" });
  return k;
}

function gridKeys(t, tIn) {
  const sorted = t >= S.sort + .35;
  const sortT = ease(seg(t, S.sort + .35, S.sort + 1.25));
  const unlockAt = S.unlock + 1.9;
  const unlocked = t >= unlockAt;
  const k = [];
  const all = new Set([...D.DEFAULT_ORDER, ...D.RAREST_ORDER]);
  for (const id of all) {
    const a = D.achievements.find((x) => x.id === id);
    const i0 = D.DEFAULT_ORDER.indexOf(id), i1 = D.RAREST_ORDER.indexOf(id);
    let c, r, op = 1, sc = 1;
    const pos = (i) => [i % 5, Math.floor(i / 5)];
    if (!sorted) {
      if (i0 < 0) continue;
      [c, r] = pos(i0);
      const app = out(seg(t, tIn + i0 * .06, tIn + i0 * .06 + .35));
      op = app; sc = .85 + .15 * app;
    } else if (i0 >= 0 && i1 >= 0) {
      const [c0, r0] = pos(i0), [c1, r1] = pos(i1);
      c = c0 + (c1 - c0) * sortT; r = r0 + (r1 - r0) * sortT;
    } else if (i0 >= 0) {
      [c, r] = pos(i0); op = 1 - seg(sortT, 0, .5); sc = 1 - .2 * seg(sortT, 0, .5);
    } else {
      [c, r] = pos(i1); op = seg(sortT, .5, 1); sc = .8 + .2 * seg(sortT, .5, 1);
    }
    let img = D.images["ach:" + id + ":" + (a.unlocked ? "unlocked" : "locked")];
    let glow = 0;
    if (id === "abyss" && t >= S.unlock + .5) {
      if (!unlocked) {
        const f = Math.floor((t - (S.unlock + .5)) / .2) % 2;
        img = D.images["ach:abyss:cel" + f]; glow = f ? 1 : .6;
      } else {
        img = D.images["ach:abyss:unlocked"];
        glow = Math.max(0, 1 - (t - unlockAt) / .8);
        sc = 1 + .12 * Math.sin(Math.PI * seg(t, unlockAt, unlockAt + .45));
      }
    }
    k.push({ id: "a-" + id, c, r, src: img, title: "", op, sc, glow, z: id === "abyss" ? 5 : 1 });
  }
  const navIn = (i) => out(seg(t, tIn + .45 + i * .06, tIn + .8 + i * .06));
  const pct = unlocked ? 50 : 48;
  const sortLabel = sorted ? "\\nRarest first" : "";
  const nav = [
    { id: "back", c: 0, src: D.images.back, title: "" },
    { id: "prev", c: 1, src: D.images.prev, title: "" },
    { id: "info", c: 2, src: D.images["ring" + pct], title: (unlocked ? "24/48" : "23/48") + sortLabel, press: S.sort + .1 },
    { id: "next", c: 3, src: D.images.next, title: "" },
    { id: "browser", c: 4, src: D.images.browser, title: "" },
  ];
  nav.forEach((n, i) => { const v = navIn(i); k.push({ ...n, r: 2, op: v, sc: .85 + .15 * v }); });
  return k;
}

function draw(t) {
  // ── Keys
  let keys = [];
  const swap = S.grid; // home → grid profile switch
  if (t < swap) {
    keys = homeKeys(t).map((k, i) => {
      const v = out(seg(t, .15 + i * .06, .5 + i * .06));
      return { op: v, sc: .85 + .15 * v, ...k, op2: 1 - seg(t, swap - .2, swap) };
    });
  } else {
    keys = gridKeys(t, swap + .05);
  }
  const seen = new Set();
  for (const k of keys) {
    const s = sprite(k.id); seen.add(k.id);
    const x = P + k.c * (K + G), y = P + k.r * (K + G);
    let sc = (k.sc ?? 1) * (k.press ? press(t, k.press) : 1);
    s.el.style.display = "block";
    s.el.style.transform = "translate(" + x + "px," + y + "px) scale(" + sc + ")";
    s.el.style.left = "0px"; s.el.style.top = "0px";
    s.el.style.opacity = (k.op ?? 1) * (k.op2 ?? 1);
    s.el.style.zIndex = k.z ?? 1;
    s.el.style.boxShadow = k.glow ? "0 0 " + (14 + 16 * k.glow) + "px rgba(245,158,11," + (.5 + .4 * k.glow) + ")" : "none";
    if (k.big) {
      const html = "<span>" + k.big[0] + "</span><b>" + k.big[1] + "</b>";
      if (s.title !== html) { s.t.innerHTML = html; s.title = html; s.t.className = "t mid big"; }
      s.img.style.display = "none";
    } else {
      s.img.style.display = k.src ? "block" : "none";
      if (k.src && s.src !== k.src) { s.img.src = k.src; s.src = k.src; }
      const pad = k.pad ?? 0;
      s.img.style.left = pad + "px"; s.img.style.top = (pad - (k.lift ?? 0)) + "px"; s.img.style.width = (K - 2 * pad) + "px"; s.img.style.height = (K - 2 * pad) + "px";
      s.img.style.opacity = k.scanning ? (.45 + .55 * Math.abs(Math.cos(t * 5))) : 1;
      if (s.title !== k.title) { s.t.textContent = k.title; s.title = k.title; s.t.className = "t"; }
    }
  }
  for (const id in sprites) if (!seen.has(id)) sprites[id].el.style.display = "none";

  // ── Captions
  const caps = [
    [S.home, S.detect, "Steam Achievement Hunter", "Your Steam profile, live on your Stream Deck", "Level, total achievements and perfect games — always one glance away."],
    [S.detect, S.grid, "01 · Auto-detect", "Knows what you're playing", "The Radar key picks up your game and shows the next achievement to hunt."],
    [S.grid, S.sort, "02 · Achievement grid", "Every achievement, at a glance", "One press loads the whole list. Locked icons are dimmed, rarity is color-coded."],
    [S.sort, S.unlock, "03 · Sort", "Rarest first, in one press", "Cycle Default, Rarest, A–Z, Locked or Unlocked from the progress key."],
    [S.unlock, S.end, "04 · Unlock", "Celebrate the moment it pops", "Fresh unlocks glow gold on the key, and your progress updates on its own."],
  ];
  let h = "";
  for (const [a, b, step, head, sub] of caps) {
    const fin = seg(t, a, a + .4), fout = 1 - seg(t, b - .3, b);
    const op = Math.min(fin, fout);
    if (op <= 0) continue;
    const dy = (1 - out(fin)) * 10;
    h += '<div class="cap" style="opacity:' + op + ';transform:translateY(' + dy + 'px)"><div class="step">' + step +
      '</div><div class="head">' + head + '</div><div class="sub">' + sub + "</div></div>";
  }
  document.getElementById("cap").innerHTML = h;

  // ── Status bar
  const bars = [];
  bars.push([S.home + .9, S.detect + .2, '<div class="pill"><span class="dot" style="background:#22c55e"></span>Connected to Steam · 63 games with achievements</div>']);
  bars.push([S.detect + .2, S.detect + .9, '<div class="pill"><span class="dot" style="background:#66c0f4;opacity:' + (.4 + .6 * Math.abs(Math.cos(t * 5))) + '"></span>Looking for a running game…</div>']);
  bars.push([S.detect + .9, S.grid, '<div class="pill"><span class="dot" style="background:#22c55e"></span>Now playing <b style="color:#fff">Ember Hollow</b> · 23 / 48 unlocked</div>']);
  bars.push([S.grid + .6, S.sort, '<div class="pill">' + D.rarity.map((r) => '<span class="chip"><i style="background:' + r.color + '"></i>' + r.label + "</span>").join("") + "</div>"]);
  bars.push([S.sort + .35, S.unlock + 1.9, '<div class="pill"><span class="dot" style="background:#f59e0b"></span>Sorted by rarity · rarest achievements first</div>']);
  bars.push([S.unlock + 1.9, S.end, '<div class="pill toast"><span style="color:#f5d0fe">Achievement unlocked</span><b style="color:#fff">Into the Abyss</b><span style="color:#a855f7">Ultra Rare · 3.2% of players</span></div>']);
  let bh = "";
  for (const [a, b, inner] of bars) {
    const op = Math.min(seg(t, a, a + .25), 1 - seg(t, b - .2, b));
    if (op > 0) bh += '<div style="position:absolute;inset:0;opacity:' + op + '">' + inner + "</div>";
  }
  document.getElementById("bar").innerHTML = bh;

  // ── End card
  const e = document.getElementById("end");
  const eo = Math.min(seg(t, S.end, S.end + .45), 1 - seg(t, D.DURATION - .35, D.DURATION));
  e.style.opacity = eo; e.style.display = eo > 0 ? "flex" : "none";
  if (eo > 0 && !e.dataset.ready) {
    e.dataset.ready = 1;
    e.innerHTML = '<svg width="96" height="96" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111a26" stroke="#263447"/>' +
      '<g fill="#f59e0b" transform="translate(8 8) scale(.75)">' +
      '<path d="M20 12h24v14a12 12 0 0 1-24 0z"/><path d="M12 14h8v6h-4c0 4 2 6 5 7l-2 4c-5-2-7-6-7-11zM52 14h-8v6h4c0 4-2 6-5 7l2 4c5-2 7-6 7-11z"/><rect x="29" y="37" width="6" height="8"/><rect x="21" y="45" width="22" height="6" rx="1"/></g></svg>' +
      "<h1>Steam Achievement Hunter</h1><p>A free, open-source Stream Deck plugin for achievement hunters.</p>" +
      '<div class="tags"><span>Auto-detect</span><span>Rarity grid</span><span>Live unlocks</span><span>Daily pick</span></div>';
  }
}
window.draw = draw;
</script></body></html>`;

// ── Capture ─────────────────────────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sd-demo-"));
fs.writeFileSync(path.join(tmp, "demo.html"), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(tmp, "demo.html")}`);
await page.evaluate(() => document.fonts.ready);

const frames = Math.round(FPS * DURATION);
for (let i = 0; i < frames; i++) {
	await page.evaluate((t) => (window as unknown as { draw: (t: number) => void }).draw(t), i / FPS);
	// let images decode before capturing
	await page.evaluate(() => Promise.all([...document.images].map((im) => (im.complete ? null : im.decode().catch(() => null)))));
	await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, "0")}.png`) });
}
await browser.close();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync("ffmpeg", [
	"-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "f%04d.png"),
	"-vf", "split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
	"-loop", "0", OUT,
]);
if (process.env.KEEP_FRAMES) console.log(`frames kept in ${tmp}`);
else fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB, ${frames} frames)`);
