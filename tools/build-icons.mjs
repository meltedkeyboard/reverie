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

// Alternate app icons, drawn in Penpot and kept in assets/brand/alt, each with a 'bg' and a
// 'glyph' group (the letter and the spark). iOS takes the whole picture. A launcher cuts an
// Android adaptive icon with its mask, so there the background is stretched past the edges
// and the glyph shrunk into the middle, as with the main icon. Where the glyph sits in the
// 1024 art (its box's center) is the same in all of them but the cropped one.
const GLYPH = { x: 412, y: 445, scale: 0.62 }
const GLYPH_OF = { 'icon-10-tone-on-tone': { x: 532, y: 617, scale: 0.47 } }

function adaptive(svg, glyph) {
  const [left, top] = svg.match(/viewBox='(\S+) (\S+) /).slice(1).map(Number)
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0]
  const bg = svg.match(/<g id='bg'>([\s\S]*?)<\/g>/)[1]
  const art = svg.match(/<g id='glyph'>([\s\S]*?)<\/g>/)[1]
  const cx = left + 512
  const cy = top + 512
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="${left} ${top} 1024 1024" fill="none">${defs}
<g transform="translate(${cx} ${cy}) scale(1.8) translate(${-cx} ${-cy})">${bg}</g>
<g transform="translate(${cx} ${cy}) scale(${glyph.scale}) translate(${-(left + glyph.x)} ${-(top + glyph.y)})">${art}</g></svg>`
}

// The icons that are pale or dark all over get a version for the other look of the Home
// Screen, and a tinted one, since iOS 18 takes the three together or none: what is drawn in
// assets/brand/alt is one look, the other is recolored here, like the main icon's tinted one.
// A tinted icon is shapes on black that iOS colors by their luminance, so the glyph is white
// with the spark grey, without the glows and shadows.
const VARIANTS = {
  'icon-04-paper-light': {
    other: 'dark',
    colors: [['#f5f1ea', '#1b1916'], ['#14121f', '#f5f1ea']],
    tinted: [['#f5f1ea', '#000000'], ['#14121f', '#ffffff'], ['#f0616d', '#8e8e93']],
  },
  'icon-09-retro-sticker': {
    other: 'dark',
    // The ink outlines and the sticker's hard shadow turn cream, to stay visible on the dark.
    colors: [['#fff1d6', '#1d1912'], ['#0b0d17', '#fff1d6'], ['0 0 0 0 0.04 0 0 0 0 0.05 0 0 0 0 0.09', '0 0 0 0 1 0 0 0 0 0.945 0 0 0 0 0.84']],
    tinted: [['#fff1d6', '#000000'], ['#5F55E0', '#ffffff'], ['#ffd166', '#8e8e93'], ['#0b0d17', '#000000']],
  },
  'icon-06-outline': {
    other: 'light',
    colors: [['#0b0d17', '#f5f5f7'], ['#8675F0', '#4C42C8']],
    tinted: [['#0b0d17', '#000000'], ['#8675F0', '#ffffff'], ['#f0616d', '#8e8e93']],
  },
  'icon-07-neon-glow': {
    other: 'light',
    // A pale lavender glow, the letter and the spark deep enough to read on it; the halos softer.
    colors: [['#130F33', '#ffffff'], ['#05040c', '#E1DFFB'], ['#B0A8FA', '#4C42C8'], ['#ff5c8a', '#f0336d'], [' 0 0 0 0.95 0', ' 0 0 0 0.45 0']],
    tinted: [['#130F33', '#000000'], ['#05040c', '#000000'], ['#B0A8FA', '#ffffff'], ['#ff5c8a', '#8e8e93']],
  },
}

function recolor(svg, pairs) {
  return pairs.reduce((out, [from, to]) => out.split(from).join(to), svg)
}

const withoutEffects = (svg) => svg.replace(/ filter='url\(#i\d+\)'/g, '')

// The previews are what the picker in Settings shows.
mkdirSync('assets/images/alt', { recursive: true })
png(light, 'assets/images/alt/default-light-preview.png', 256)
png(dark, 'assets/images/alt/default-dark-preview.png', 256)
for (const file of readdirSync(`${BRAND}/alt`).filter((f) => f.endsWith('.svg')).sort()) {
  const slug = file.replace(/\.svg$/, '')
  const svg = readFileSync(`${BRAND}/alt/${file}`, 'utf8')
  png(svg, `assets/images/alt/${slug}.png`)
  png(svg, `assets/images/alt/${slug}-preview.png`, 256)
  png(adaptive(svg, GLYPH_OF[slug] ?? GLYPH), `assets/images/alt/${slug}-foreground.png`)
  const variant = VARIANTS[slug]
  if (variant) {
    const other = recolor(svg, variant.colors)
    png(other, `assets/images/alt/${slug}-${variant.other}.png`)
    png(other, `assets/images/alt/${slug}-${variant.other}-preview.png`, 256)
    png(withoutEffects(recolor(svg, variant.tinted)), `assets/images/alt/${slug}-tinted.png`)
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
