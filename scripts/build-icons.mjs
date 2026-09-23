// Renders every app icon, splash and favicon from the two SVGs in assets/brand.
// Run after changing them: npm run icons
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

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

function png(svg, file, width = 1024) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render()
  writeFileSync(file, image.asPng())
  console.log(`${file} ${width}px`)
}

mkdirSync('assets/images', { recursive: true })
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
