// Renders every app icon, splash, favicon, the link preview and the home screen
// pattern from the SVGs in assets/brand. The output is not committed: it is rebuilt on
// every npm install/ci, or by hand after changing the SVGs: npm run icons
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BRAND = 'assets/brand'
const light = readFileSync(`${BRAND}/icon-light.svg`, 'utf8')
const dark = readFileSync(`${BRAND}/icon-dark.svg`, 'utf8')
const wordmark = readFileSync(`${BRAND}/wordmark.svg`, 'utf8')

// The icon's inner markup, to be placed inside other SVGs.
function body(svg) {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}

// Same shapes on black, the letter white and the spark grey: iOS 18 colors a tinted
// icon from its luminance.
const tinted = dark
  .replace(/fill="#0F0F12"/i, 'fill="#000000"')
  .replace(/fill="#8B5CF6"/i, 'fill="#FFFFFF"')
  .replace(/fill="#F0616D"/i, 'fill="#8E8E93"')
  .replace(/clip_dark/g, 'clip_tinted')

// iOS rounds the corners of an app icon itself; elsewhere they are rounded here, at the
// same share of the side.
const CORNER = 0.2237

function rounded(svg, id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><clipPath id="${id}"><rect width="1024" height="1024" rx="${1024 * CORNER}"/></clipPath></defs>
<g clip-path="url(#${id})">${body(svg)}</g></svg>`
}

// Android crops an adaptive icon to its middle two thirds, so the whole design goes
// there; the margin, only seen while the launcher animates, is the icon's background.
function adaptive(svg) {
  const scale = 2 / 3
  const offset = (1024 * (1 - scale)) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<g transform="translate(${offset} ${offset}) scale(${scale})">${body(svg)}</g></svg>`
}

// One favicon for both themes: the browser applies the media query inside it.
function favicon() {
  const themed = body(light)
    .replace('fill="#F5F5F7"', 'class="bg" fill="#F5F5F7"')
    .replace(/clip_light/g, 'clip_favicon')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<style>@media (prefers-color-scheme: dark) { .bg { fill: #0F0F12 } }</style>
<defs><clipPath id="favicon_round"><rect width="1024" height="1024" rx="${1024 * CORNER}"/></clipPath></defs>
<g clip-path="url(#favicon_round)">${themed}</g></svg>`
}

// The link preview: the wordmark on the dark background, its letters (not the spark
// sticking out past them) centered.
function ogImage() {
  const [vx, vy, vw, vh] = wordmark.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)
  const width = 760
  const scale = width / vw
  const height = vh * scale
  const x = (1200 - width) / 2 + (vx + vw / 2 - LETTERS.x) * scale
  const y = (630 - height) / 2 + (vy + vh / 2 - LETTERS.y) * scale
  const inner = wordmark.replace(/^[\s\S]*?<g /, '<g ').replace(/<\/svg>\s*$/, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0F0F12"/>
<g transform="translate(${x} ${y}) scale(${scale}) translate(${-vx} ${-vy})">${inner}</g></svg>`
}

// Middle of the letters in wordmark.svg units; the spark reaches past them up and left.
const LETTERS = { x: 7173.6 / 2, y: 1058 / 2 }

function png(svg, file, width = 1024) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render()
  writeFileSync(file, image.asPng())
  console.log(`${file} ${width}px`)
}

mkdirSync('assets/images', { recursive: true })
mkdirSync('public', { recursive: true })
png(light, 'assets/images/icon.png')
png(dark, 'assets/images/icon-dark.png')
png(tinted, 'assets/images/icon-tinted.png')
png(adaptive(light), 'assets/images/adaptive-icon.png')
png(rounded(light, 'splash_light'), 'assets/images/splash-icon.png', 512)
png(rounded(dark, 'splash_dark'), 'assets/images/splash-icon-dark.png', 512)
png(rounded(light, 'favicon_light'), 'assets/images/favicon.png', 196)

writeFileSync('public/favicon.svg', favicon())
console.log('public/favicon.svg')
png(light, 'public/apple-touch-icon.png', 180)

png(ogImage(), 'public/og-image.png', 1200)

// The home screen's background tile, at every density the app picks from.
for (const theme of ['light', 'dark']) {
  const tile = readFileSync(`${BRAND}/pattern-${theme}.svg`, 'utf8')
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`
    png(tile, `assets/images/pattern-${theme}${suffix}.png`, 131 * scale)
  }
}
