// TeX written inside a sentence ($x^2$, \(\alpha\)) is turned into plain characters
// (x², α), so it stays a part of the text: it wraps, is selected and copied with it.
// A formula of its own line is drawn whole by MathJax (components/chat/MathBlock).

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  oplus: '⊕', otimes: '⊗', setminus: '∖', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  ll: '≪', gg: '≫', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', nexists: '∄',
  neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', top: '⊤', bot: '⊥', perp: '⊥',
  parallel: '∥', mid: '∣', angle: '∠', therefore: '∴', because: '∵',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', longleftarrow: '⟵',
  infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬',
  iiint: '∭', oint: '∮', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wp: '℘', prime: '′',
  degree: '°', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', lvert: '|', rvert: '|', vert: '|',
  lVert: '‖', rVert: '‖', Vert: '‖', backslash: '\\', checkmark: '✓', dagger: '†',
  '|': '‖', quad: '\u2003', qquad: '\u2003\u2003',
}

// Names a formula sets upright, as words: they come out as they are.
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det', 'dim',
  'deg', 'gcd', 'arg', 'ker', 'Pr', 'mod', 'bmod',
])

// Commands whose argument is shown as it is: a font or a style has no plain form.
const WRAPPERS = new Set([
  'text', 'textrm', 'textit', 'textbf', 'textsf', 'texttt', 'mathrm', 'mathit', 'mathbf', 'mathsf',
  'mathtt', 'mathcal', 'mathscr', 'mathfrak', 'boldsymbol', 'bm', 'operatorname',
  'mbox', 'hbox', 'underline', 'boxed',
])

// Commands that only size or space something, and go without a trace.
const DROPPED = new Set([
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'middle',
  'limits', 'nolimits', 'displaystyle', 'textstyle', 'scriptstyle', 'nonumber', 'notag',
])

const ACCENTS: Record<string, string> = {
  hat: '\u0302', widehat: '\u0302', bar: '\u0304', overline: '\u0305', vec: '\u20D7',
  overrightarrow: '\u20D7', dot: '\u0307', ddot: '\u0308', tilde: '\u0303', widetilde: '\u0303',
  acute: '\u0301', grave: '\u0300', breve: '\u0306', check: '\u030C',
}

const DOUBLE: Record<string, string> = {
  R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ', E: '𝔼', '1': '𝟙',
}

const SUPER: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ',
  f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ',
  s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ',
  G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ',
  U: 'ᵁ', V: 'ⱽ', W: 'ᵂ', 'α': 'ᵅ', 'β': 'ᵝ', 'γ': 'ᵞ', 'δ': 'ᵟ', 'θ': 'ᶿ', 'ϕ': 'ᵠ', 'φ': 'ᵠ', 'χ': 'ᵡ',
  '′': '′', '∗': '*', '*': '*', '∘': '°', '⊤': 'ᵀ', ' ': '',
}

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ',
  k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'ϕ': 'ᵩ', 'φ': 'ᵩ', 'χ': 'ᵪ', ' ': '',
}

const FRACTIONS: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗',
  '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/7': '⅐', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
  '1/9': '⅑', '1/10': '⅒',
}

// A token of TeX: a command with its name, a group in braces, or a single character.
type Token = { command: string } | { group: string } | { char: string }

// The formula as plain characters, as near to how it reads as plain text allows.
export function texToUnicode(tex: string): string {
  return new Reader(tex).run().replace(/[ \t\n]+/g, ' ').trim()
}

class Reader {
  private at = 0
  constructor(private readonly src: string) {}

  run(): string {
    let out = ''
    while (this.at < this.src.length) out += this.next()
    return out
  }

  private token(): Token | null {
    const { src } = this
    while (src[this.at] === ' ' || src[this.at] === '\n' || src[this.at] === '\t') this.at++
    if (this.at >= src.length) return null
    const c = src[this.at]
    if (c === '\\') {
      const name = /^[a-zA-Z]+/.exec(src.slice(this.at + 1))?.[0] ?? src[this.at + 1] ?? ''
      this.at += 1 + name.length
      return { command: name }
    }
    if (c === '{') {
      let depth = 0
      const start = this.at
      for (; this.at < src.length; this.at++) {
        if (src[this.at] === '\\') this.at++
        else if (src[this.at] === '{') depth++
        else if (src[this.at] === '}' && --depth === 0) break
      }
      this.at++
      return { group: src.slice(start + 1, this.at - 1) }
    }
    this.at++
    return { char: c }
  }

  // The argument of a command, a group or a single token, as text.
  private argument(): string {
    const token = this.token()
    if (!token) return ''
    if ('group' in token) return new Reader(token.group).run()
    return this.render(token)
  }

  // An optional argument in brackets, as the root's degree in \sqrt[3]{x}.
  private optional(): string | null {
    while (this.src[this.at] === ' ') this.at++
    if (this.src[this.at] !== '[') return null
    const end = this.src.indexOf(']', this.at)
    if (end < 0) return null
    const inside = this.src.slice(this.at + 1, end)
    this.at = end + 1
    return new Reader(inside).run()
  }

  // TeX spaces a formula itself and ignores the spaces in it; here the author's spaces
  // are all the spacing there is, so they are kept, one for a run.
  private next(): string {
    if (/\s/.test(this.src[this.at])) {
      while (/\s/.test(this.src[this.at] ?? '')) this.at++
      return ' '
    }
    const token = this.token()
    if (!token) return ''
    if ('char' in token && (token.char === '^' || token.char === '_')) {
      return script(this.argument().trim(), token.char === '^' ? SUPER : SUB, token.char)
    }
    return this.render(token)
  }

  private render(token: Token): string {
    if ('group' in token) return new Reader(token.group).run()
    if ('char' in token) {
      if (token.char === '~') return ' '
      if (token.char === '&') return ' '
      if (token.char === "'") return '′'
      if (token.char === '-') return '−'
      return token.char
    }
    const name = token.command
    if (name in SYMBOLS) return SYMBOLS[name]
    // A function's name is parted from the letter it applies to (cos θ), but not from
    // its limits or its brackets.
    if (FUNCTIONS.has(name)) return name === 'bmod' ? ' mod ' : /^[\\a-zA-Z0-9]/.test(this.src.slice(this.at)) ? `${name} ` : name
    if (WRAPPERS.has(name)) return this.argument()
    if (DROPPED.has(name)) return ''
    if (name in ACCENTS) {
      const mark = ACCENTS[name]
      return Array.from(this.argument()).map((ch) => (/\s/.test(ch) ? ch : ch + mark)).join('')
    }
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
      case 'cfrac': {
        const top = this.argument().trim()
        const bottom = this.argument().trim()
        return FRACTIONS[`${top}/${bottom}`] ?? `${wrap(top)}/${wrap(bottom)}`
      }
      case 'binom':
        return `C(${this.argument().trim()}, ${this.argument().trim()})`
      case 'sqrt': {
        const degree = this.optional()
        const body = this.argument().trim()
        const sign = degree === '3' ? '∛' : degree === '4' ? '∜' : degree ? script(degree, SUPER, '^') + '√' : '√'
        return sign + wrap(body)
      }
      case 'mathbb':
        return Array.from(this.argument()).map((ch) => DOUBLE[ch] ?? ch).join('')
      case 'not':
        return this.argument() + '\u0338'
      case 'begin':
      case 'end':
        this.argument()
        return ''
      case '\\':
        return '; '
      case ',':
      case ':':
      case '>':
        return '\u2009'
      case ';':
        return ' '
      case '!':
        return ''
      case ' ':
        return ' '
      default:
        // A brace, a percent or a dollar escaped by its backslash, or a command this does
        // not know, which reads better by its name than with the backslash.
        return name
    }
  }
}

// A sub- or superscript in the small characters when every one of them has one,
// otherwise written out with its mark: x², but x^(a+q).
function script(text: string, map: Record<string, string>, mark: string) {
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.every((ch) => ch in map)) return chars.map((ch) => map[ch]).join('')
  return mark + (chars.length > 1 ? `(${text})` : text)
}

// What goes over or under a fraction's bar in parentheses, unless it is one thing.
function wrap(text: string) {
  return /^[\p{L}\p{N}.,′]+$/u.test(text) || /^\(.*\)$/.test(text) ? text : `(${text})`
}
