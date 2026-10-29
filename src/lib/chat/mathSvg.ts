// A formula of its own line drawn by MathJax into an SVG, which react-native-svg shows
// the same on every platform, without a web view.

// The SVG's markup, its glyphs filled with currentColor, and its size in ems of the
// text around it.
export type MathSvg = { xml: string; width: number; height: number }

type Convert = (tex: string) => MathSvg

let convert: Convert | null = null

// MathJax is loaded on the first formula: a good part of a megabyte of glyph outlines
// that most chats never need.
function load(): Convert {
  const { mathjax } = require('mathjax-full/js/mathjax.js') as typeof import('mathjax-full/js/mathjax.js')
  const { TeX } = require('mathjax-full/js/input/tex.js') as typeof import('mathjax-full/js/input/tex.js')
  const { SVG } = require('mathjax-full/js/output/svg.js') as typeof import('mathjax-full/js/output/svg.js')
  const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js') as typeof import('mathjax-full/js/adaptors/liteAdaptor.js')
  const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js') as typeof import('mathjax-full/js/handlers/html.js')
  require('mathjax-full/js/input/tex/base/BaseConfiguration.js')
  require('mathjax-full/js/input/tex/ams/AmsConfiguration.js')
  require('mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js')
  require('mathjax-full/js/input/tex/cancel/CancelConfiguration.js')

  const adaptor = liteAdaptor()
  RegisterHTMLHandler(adaptor)
  const document = mathjax.document('', {
    InputJax: new TeX({
      packages: ['base', 'ams', 'boldsymbol', 'cancel'],
      // A mistake in the formula throws rather than drawing MathJax's red message,
      // so the formula is shown as text instead.
      formatError: (_jax: unknown, error: Error) => {
        throw error
      },
    }),
    // Every glyph drawn where it stands: react-native-svg does not follow <use> into
    // the shared definitions MathJax would make otherwise.
    OutputJax: new SVG({ fontCache: 'none' }),
  })

  return (tex) => {
    const svg = adaptor.firstChild(document.convert(tex, { display: true })) as any
    const box = String(adaptor.getAttribute(svg, 'viewBox')).split(' ').map(Number)
    // Its own size is in exes of MathJax's font; the size is set where it is shown.
    const xml = adaptor.outerHTML(svg).replace(/^<svg[^>]*>/, (tag: string) => tag.replace(/ (?:width|height|style)="[^"]*"/g, ''))
    // The viewBox is in thousandths of an em.
    return { xml, width: box[2] / 1000, height: box[3] / 1000 }
  }
}

const CACHE = 200
const cache = new Map<string, MathSvg | null>()

// null when MathJax cannot read the formula.
export function texToSvg(tex: string): MathSvg | null {
  if (cache.has(tex)) return cache.get(tex)!
  let result: MathSvg | null
  try {
    convert ??= load()
    result = convert(tex)
  } catch {
    result = null
  }
  cache.set(tex, result)
  if (cache.size > CACHE) cache.delete(cache.keys().next().value!)
  return result
}
