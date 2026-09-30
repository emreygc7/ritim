// Renders the Ritim icon (a colour ring on a dark rounded square) to PNGs
// without any image tooling: pixels are computed and encoded with zlib.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const STOPS = ['#4a3aa7', '#2a78d6', '#1baf7a', '#eda100', '#eb6834', '#4a3aa7'].map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
])

function ringColor(angle) {
  // angle 0..1 clockwise from the top
  const x = angle * (STOPS.length - 1)
  const i = Math.min(Math.floor(x), STOPS.length - 2)
  const f = x - i
  return STOPS[i].map((c, k) => c + (STOPS[i + 1][k] - c) * f)
}

function roundedSquare(x, y, r) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0)
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0)
  return Math.hypot(dx, dy) <= r
}

/** Returns [r,g,b,a] (0-255, straight alpha) for a normalized point. */
function sample(x, y, withBackground) {
  const pad = withBackground ? 0.04 : 0
  const inside = !withBackground || roundedSquare((x - pad) / (1 - 2 * pad), (y - pad) / (1 - 2 * pad), 0.22)
  if (!inside) return [0, 0, 0, 0]
  const dx = x - 0.5
  const dy = y - 0.5
  const d = Math.hypot(dx, dy)
  const [outer, inner] = withBackground ? [0.31, 0.19] : [0.46, 0.28]
  // playhead dot sitting on the ring at the top-right
  const a = 0.14 * 2 * Math.PI
  const mid = (outer + inner) / 2
  const dot = Math.hypot(dx - Math.sin(a) * mid, dy + Math.cos(a) * mid) <= (outer - inner) * 0.62
  if (dot) return [255, 255, 255, 255]
  if (d <= outer && d >= inner) {
    const angle = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1
    return [...ringColor(angle), 255]
  }
  return withBackground ? [28, 27, 34, 255] : [0, 0, 0, 0]
}

function render(size, withBackground) {
  const SS = 4
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, withBackground)
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca
        }
      }
      const i = (y * size + x) * 4
      px[i] = a ? r / a : 0
      px[i + 1] = a ? g / a : 0
      px[i + 2] = a ? b / a : 0
      px[i + 3] = a / (SS * SS)
    }
  }
  return encodePng(size, px)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

mkdirSync('resources/icons', { recursive: true })
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  writeFileSync(`resources/icons/${size}x${size}.png`, render(size, true))
}
writeFileSync('resources/icons/tray.png', render(64, false))
console.log('icons written to resources/icons')
