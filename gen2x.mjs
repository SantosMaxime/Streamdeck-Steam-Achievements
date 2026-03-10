import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf) {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < buf.length; i++) {
		crc ^= buf[i];
		for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const t = Buffer.from(type, "ascii");
	const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
	return Buffer.concat([len, t, data, c]);
}

function png(w, h, r, g, b) {
	const sig = Buffer.from([137,80,78,71,13,10,26,10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
	const raw = Buffer.alloc(h*(1+w*4));
	for (let y=0;y<h;y++) { const o=y*(1+w*4); raw[o]=0;
		for (let x=0;x<w;x++) { const p=o+1+x*4; raw[p]=r; raw[p+1]=g; raw[p+2]=b; raw[p+3]=255; }
	}
	return Buffer.concat([sig, chunk("IHDR",ihdr), chunk("IDAT",deflateSync(raw)), chunk("IEND",Buffer.alloc(0))]);
}

const SD = "com.maxik.steam-achievements.sdPlugin";
const files = [
	[SD+"/imgs/plugin/marketplace@2x.png",       576, 576, 46,139,87],
	[SD+"/imgs/plugin/category-icon@2x.png",      56,  56, 46,139,87],
	[SD+"/imgs/actions/dashboard/icon@2x.png",     40,  40, 70,130,180],
	[SD+"/imgs/actions/dashboard/key@2x.png",     144, 144, 70,130,180],
	[SD+"/imgs/actions/radar/icon@2x.png",         40,  40, 218,165,32],
	[SD+"/imgs/actions/radar/key@2x.png",         144, 144, 218,165,32],
];
for (const [p,w,h,r,g,b] of files) { writeFileSync(p, png(w,h,r,g,b)); console.log("OK "+p+"  ("+w+"x"+h+")"); }
