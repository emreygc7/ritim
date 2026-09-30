// Builds every icon from resources/logo.png: app icons (PNG, Windows .ico,
// macOS .icns), the tray icon and the logo used inside the app.
// Runs in Electron (`npm run icons`) to use its image scaling, so no extra
// image dependency is needed.
const { app, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')

function squareCrop(img) {
  // Find the visible part (alpha > 16), then take a square around it with a small margin.
  const { width: w, height: h } = img.getSize()
  const px = img.toBitmap() // BGRA
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  const side = Math.min(Math.round(Math.max(x1 - x0, y1 - y0) * 1.04), w, h)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const x = Math.max(0, Math.min(w - side, Math.round(cx - side / 2)))
  const y = Math.max(0, Math.min(h - side, Math.round(cy - side / 2)))
  return img.crop({ x, y, width: side, height: side })
}

function ico(png, sizes) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  const entries = []
  let offset = 6 + 16 * sizes.length
  for (const s of sizes) {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s // 0 means 256
    e[1] = s >= 256 ? 0 : s
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png[s].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png[s].length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...sizes.map((s) => png[s])])
}

function icns(png) {
  // PNG payloads: ic07 128, ic08 256, ic09 512, ic10 1024 (512@2x).
  const chunks = [['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]].map(([type, s]) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(png[s].length + 8, 4)
    return Buffer.concat([head, png[s]])
  })
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

app.whenReady().then(() => {
  const source = nativeImage.createFromPath('resources/logo.png')
  if (source.isEmpty()) throw new Error('resources/logo.png not found')
  const square = squareCrop(source)
  const png = {}
  for (const s of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    png[s] = square.resize({ width: s, height: s, quality: 'best' }).toPNG()
  }
  mkdirSync('resources/icons', { recursive: true })
  for (const s of [16, 32, 48, 64, 128, 256, 512]) writeFileSync(`resources/icons/${s}x${s}.png`, png[s])
  writeFileSync('resources/icons/tray.png', png[64])
  writeFileSync('resources/icons/icon.ico', ico(png, [16, 32, 48, 64, 128, 256]))
  writeFileSync('resources/icons/icon.icns', icns(png))
  writeFileSync('src/renderer/src/assets/logo.png', png[256])
  console.log('icons written from resources/logo.png')
  app.quit()
})
