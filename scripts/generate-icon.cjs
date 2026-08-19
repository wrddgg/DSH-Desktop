const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const size = 512
const pixels = Buffer.alloc(size * size * 4)

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const body = Buffer.concat([name, data])
  const output = Buffer.alloc(data.length + 12)
  output.writeUInt32BE(data.length, 0)
  body.copy(output, 4)
  output.writeUInt32BE(crc32(body), data.length + 8)
  return output
}

function roundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  return Math.hypot(x - cx, y - cy) <= radius
}

function triangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by)
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy)
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay)
  return !(d1 < 0 || d2 < 0 || d3 < 0) || !(d1 > 0 || d2 > 0 || d3 > 0)
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

function composite(index, red, green, blue, alpha) {
  const previousAlpha = pixels[index + 3] / 255
  const nextAlpha = alpha + previousAlpha * (1 - alpha)
  if (nextAlpha === 0) return
  pixels[index] = Math.round((red * alpha + pixels[index] * previousAlpha * (1 - alpha)) / nextAlpha)
  pixels[index + 1] = Math.round((green * alpha + pixels[index + 1] * previousAlpha * (1 - alpha)) / nextAlpha)
  pixels[index + 2] = Math.round((blue * alpha + pixels[index + 2] * previousAlpha * (1 - alpha)) / nextAlpha)
  pixels[index + 3] = Math.round(nextAlpha * 255)
}

const samples = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]
for (let py = 0; py < size; py += 1) {
  for (let px = 0; px < size; px += 1) {
    const index = (py * size + px) * 4
    let baseCoverage = 0
    let bubbleCoverage = 0
    let firstLineCoverage = 0
    let secondLineCoverage = 0
    for (const [ox, oy] of samples) {
      const x = px + ox
      const y = py + oy
      if (roundedRect(x, y, 52, 52, 460, 460, 108)) baseCoverage += 0.25
      if (roundedRect(x, y, 142, 142, 370, 327, 29) || triangle(x, y, 192, 306, 248, 326, 192, 376)) bubbleCoverage += 0.25
      if (segmentDistance(x, y, 194, 211, 318, 211) <= 12) firstLineCoverage += 0.25
      if (segmentDistance(x, y, 194, 261, 275, 261) <= 12) secondLineCoverage += 0.25
    }

    if (baseCoverage > 0) {
      const t = Math.max(0, Math.min(1, (px + py - 104) / 816))
      composite(index, 86 - 46 * t, 135 - 46 * t, 240 - 39 * t, baseCoverage)
    }
    if (bubbleCoverage > 0) composite(index, 255, 255, 255, bubbleCoverage * 0.97)
    if (firstLineCoverage > 0) composite(index, 65, 118, 230, firstLineCoverage)
    if (secondLineCoverage > 0) composite(index, 65, 118, 230, secondLineCoverage)
  }
}

const raw = Buffer.alloc((size * 4 + 1) * size)
for (let row = 0; row < size; row += 1) {
  const rawOffset = row * (size * 4 + 1)
  raw[rawOffset] = 0
  pixels.copy(raw, rawOffset + 1, row * size * 4, (row + 1) * size * 4)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(size, 0)
ihdr.writeUInt32BE(size, 4)
ihdr[8] = 8
ihdr[9] = 6

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const output = path.join(__dirname, '..', 'build', 'icon.png')
fs.writeFileSync(output, png)
console.log(`Generated ${output} (${png.length} bytes)`)
