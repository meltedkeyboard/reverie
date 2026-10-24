// Renders every app icon, the splash and the home screen pattern from the SVGs in
// assets/brand. The output is not committed: it is rebuilt on every npm install/ci, or
// by hand after changing the SVGs: npm run icons
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const BRAND = 'assets/brand'
const light = readFileSync(`${BRAND}/icon-light.svg`, 'utf8')
const dark = readFileSync(`${BRAND}/icon-dark.svg`, 'utf8')

// The icon's inner markup, to be placed inside other SVGs.
function body(svg) {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}

// Same shapes on black, the letter white and the spark grey: iOS 18 colors a tinted
// icon from its luminance.
const tinted = dark
  .replace(/fill="#0F0F12"/i, 'fill="#000000"')
  .replace(/fill="#5F55E0"/i, 'fill="#FFFFFF"')
  .replace(/fill="#F0616D"/i, 'fill="#8E8E93"')
  .replace(/clip_dark/g, 'clip_tinted')

function png(svg, file, width = 1024) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render()
  writeFileSync(file, image.asPng())
  console.log(`${file} ${width}px`)
}

// Android adaptive icon: the glyph alone on a transparent canvas, shrunk into the inner
// two thirds that no launcher mask cuts. The background color comes from app.json. The
// glyph's box in the 1024 icon is about x 79..788, y 127..763, centered on (433, 445).
function glyphOnly(svg, recolor) {
  const paths = body(svg).match(/<path[\s\S]*?\/>/g).join('')
  const art = recolor ? paths.replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${recolor}"`) : paths
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<g transform="translate(512 512) scale(0.62) translate(-433 -445)">${art}</g></svg>`
}

mkdirSync('assets/images', { recursive: true })
png(light, 'assets/images/icon.png')
png(dark, 'assets/images/icon-dark.png')
png(tinted, 'assets/images/icon-tinted.png')
png(glyphOnly(dark), 'assets/images/adaptive-icon.png')
png(glyphOnly(dark, '#FFFFFF'), 'assets/images/adaptive-icon-mono.png')
// The splash is the whole square, unrounded: its background is the splash's own color, so
// rounded corners only left a faint edge around it.
png(light, 'assets/images/splash-icon.png', 512)
png(dark, 'assets/images/splash-icon-dark.png', 512)
const wordmark = readFileSync(`${BRAND}/wordmark.svg`, 'utf8')
png(wordmark, 'assets/images/wordmark.png', 552)

// Alternate app icons, drawn in Penpot and exported into assets/brand/alt. Each SVG marks its
// parts with comments: bg, the glyph (the letter and the spark) and top, what lies over the
// glyph, such as Paper's creases. iOS takes the whole picture. A launcher cuts an Android
// adaptive icon with its mask, so there the background and what lies on top are stretched
// past the edges and the glyph shrunk into the middle, as with the main icon. Where the glyph
// sits in the 1024 art (its box's center) is the same in all of them.
const GLYPH = { x: 412, y: 445, scale: 0.62 }

function part(svg, name) {
  return svg.match(new RegExp(`<!--${name}-->([\\s\\S]*?)<!--/${name}-->`))[1]
}

function canvas(svg) {
  const [left, top] = svg.match(/viewBox="(\S+) (\S+) /).slice(1).map(Number)
  const open = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="${left} ${top} 1024 1024" fill="none">`
  return { left, top, open }
}

function adaptive(svg) {
  const { left, top, open } = canvas(svg)
  const cx = left + 512
  const cy = top + 512
  return `${open}
<g transform="translate(${cx} ${cy}) scale(1.8) translate(${-cx} ${-cy})">${part(svg, 'bg')}${part(svg, 'top')}</g>
<g transform="translate(${cx} ${cy}) scale(${GLYPH.scale}) translate(${-(left + GLYPH.x)} ${-(top + GLYPH.y)})">${part(svg, 'glyph')}</g></svg>`
}

// An icon drawn in both looks of the Home Screen, its other look in <slug>-<look>.svg, also
// gets a tinted one, since iOS 18 takes the three together or none. A tinted icon is shapes on
// black that iOS colors by their luminance: the glyph alone, the letter white and the spark
// grey, without the shadows.
const VARIANTS = {
  'icon-04-paper': { other: 'dark', tinted: [['fill:#14121f', 'fill:#ffffff'], ['fill:#f0616d', 'fill:#8e8e93']] },
}

function recolor(svg, pairs) {
  return pairs.reduce((out, [from, to]) => out.split(from).join(to), svg)
}

function tintedLook(svg, pairs) {
  const { left, top, open } = canvas(svg)
  const glyph = recolor(part(svg, 'glyph'), pairs).replace(/ filter="url\(#[^)]*\)"/g, '')
  return `${open}<rect x="${left}" y="${top}" width="1024" height="1024" fill="#000000"/>${glyph}</svg>`
}

// The other looks are drawn files of their own, not icons to list.
const looks = new Set(Object.entries(VARIANTS).map(([slug, v]) => `${slug}-${v.other}.svg`))

// The previews are what the picker in Settings shows.
mkdirSync('assets/images/alt', { recursive: true })
png(light, 'assets/images/alt/default-light-preview.png', 256)
png(dark, 'assets/images/alt/default-dark-preview.png', 256)
for (const file of readdirSync(`${BRAND}/alt`).filter((f) => f.endsWith('.svg') && !looks.has(f)).sort()) {
  const slug = file.replace(/\.svg$/, '')
  const svg = readFileSync(`${BRAND}/alt/${file}`, 'utf8')
  png(svg, `assets/images/alt/${slug}.png`)
  png(svg, `assets/images/alt/${slug}-preview.png`, 256)
  png(adaptive(svg), `assets/images/alt/${slug}-foreground.png`)
  const variant = VARIANTS[slug]
  if (variant) {
    const other = readFileSync(`${BRAND}/alt/${slug}-${variant.other}.svg`, 'utf8')
    png(other, `assets/images/alt/${slug}-${variant.other}.png`)
    png(other, `assets/images/alt/${slug}-${variant.other}-preview.png`, 256)
    png(tintedLook(svg, variant.tinted), `assets/images/alt/${slug}-tinted.png`)
  }
}

// The home screen's background tile, at every density the app picks from.
for (const theme of ['light', 'dark']) {
  const tile = readFileSync(`${BRAND}/pattern-${theme}.svg`, 'utf8')
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`
    png(tile, `assets/images/pattern-${theme}${suffix}.png`, 131 * scale)
  }
}
