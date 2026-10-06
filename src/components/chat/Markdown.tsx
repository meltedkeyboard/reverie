import { Lexer, type Token, type Tokens } from 'marked'
import { Fragment, memo, useMemo, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native'

import { useColors, useStyles, type Colors } from '@/theme'
import { FONTS, isWeb } from '@/lib/core/platform'

type Props = {
  text: string
  style: StyleProp<TextStyle>
  // How *emphasis* looks: a roleplay reply mutes its actions, other text just slants.
  emStyle?: StyleProp<TextStyle>
  streaming?: boolean
  // false draws plain Text, which leaves a long press to the parent: the user's bubble
  // opens its menu on one, where a reply selects text.
  selectable?: boolean
}

const HEADING_SCALE = [1.35, 1.2, 1.1, 1, 1, 1]
const CODE_FONT = FONTS.mono
const INDENT = '    '

// A selectable Text on iOS only offers to copy all of it. A read-only UITextView gives
// the system selection with handles, and RN exposes one as a TextInput.
export function SelectableText({ style, children }: { style: StyleProp<TextStyle>; children: ReactNode }) {
  const colors = useColors()
  // A browser selects ordinary text by itself, and a <textarea> cannot hold nested Text.
  if (isWeb) return <Text style={style}>{children}</Text>
  return (
    <TextInput
      editable={false}
      multiline
      scrollEnabled={false}
      dataDetectorTypes="link"
      selectionColor={colors.accent}
      style={[blockReset, style]}
    >
      <Text>{children}</Text>
    </TextInput>
  )
}

function PlainText({ style, children }: { style: StyleProp<TextStyle>; children: ReactNode }) {
  return <Text style={style}>{children}</Text>
}

const blockReset = { padding: 0, paddingTop: 0, paddingBottom: 0 } as const

// A piece of the reply: a paragraph, a heading or a list item flows as text, a code
// block or a table needs a view of its own. tight: a list item after the first one,
// which follows on the next line with no gap.
type Piece = { flow: true; node: ReactNode; tight: boolean } | { flow: false; node: ReactNode }

// Pieces that flow are joined into one UITextView, so a selection runs through the
// whole reply and only stops at a code block or a table, as in ChatGPT. Lists and
// quotes are drawn with characters for the same reason: a view would split the text.
function MarkdownView({ text, style, emStyle, streaming = false, selectable = true }: Props) {
  const Block = selectable ? SelectableText : PlainText
  const styles = useStyles(createStyles)
  // breaks: a model writes dialogue and verse line by line, and a single newline must
  // stay a line break rather than join the lines as plain Markdown would.
  const tokens = useMemo(
    () => Lexer.lex(streaming ? closeOpenEmphasis(text) : text, { gfm: true, breaks: true }),
    [text, streaming]
  )
  const size = StyleSheet.flatten(style).fontSize ?? 17
  const em = emStyle ?? styles.em

  const inline = (list: Token[]): ReactNode[] =>
    list.map((token, i) => {
      switch (token.type) {
        case 'strong':
          return <Text key={i} style={styles.strong}>{inline((token as Tokens.Strong).tokens)}</Text>
        case 'em':
          return <Text key={i} style={em}>{inline((token as Tokens.Em).tokens)}</Text>
        case 'del':
          return <Text key={i} style={styles.del}>{inline((token as Tokens.Del).tokens)}</Text>
        case 'codespan':
          return <Text key={i} style={[styles.codespan, { fontSize: size * 0.85 }]}>{token.text}</Text>
        // Inside a UITextView a nested Text can't be pressed; bare URLs are still opened
        // by the link detector.
        case 'link':
          return <Text key={i} style={styles.link}>{inline((token as Tokens.Link).tokens)}</Text>
        case 'br':
          return '\n'
        case 'html':
          return ''
        case 'text':
          return token.tokens ? <Fragment key={i}>{inline(token.tokens)}</Fragment> : token.text
        default:
          return 'text' in token ? token.text : token.raw
      }
    })

  // indent: the room for the list markers, put before every line a list item starts.
  // bullet: the marker of a list item, which takes the place of the indent's tail on the
  // item's first line, so every line of the item starts its text at the same column.
  const collect = (list: Token[], indent: string, quote: boolean, bullet: { mark: string | null }): Piece[] =>
    list.flatMap((token): Piece[] => {
      let head = indent
      if (bullet.mark !== null && token.type !== 'space' && token.type !== 'list') {
        head = indent.slice(INDENT.length) + `${bullet.mark} `.padStart(INDENT.length)
        bullet.mark = null
      }
      const lead = head || quote ? (
        <Text style={styles.marker}>
          {head}
          {quote ? '┃ ' : ''}
        </Text>
      ) : null
      switch (token.type) {
        case 'space':
        case 'def':
          return []
        case 'paragraph':
        case 'text':
          return [{
            flow: true,
            tight: false,
            node: (
              <Text style={quote ? styles.quote : undefined}>
                {lead}
                {token.tokens ? inline(token.tokens) : token.text}
              </Text>
            ),
          }]
        case 'heading': {
          const heading = token as Tokens.Heading
          const fontSize = size * HEADING_SCALE[heading.depth - 1]
          return [{
            flow: true,
            tight: false,
            node: (
              <Text style={[styles.heading, { fontSize, lineHeight: Math.round(fontSize * 1.35) }]}>
                {lead}
                {inline(heading.tokens)}
              </Text>
            ),
          }]
        }
        case 'blockquote':
          return collect((token as Tokens.Blockquote).tokens, indent, true, bullet)
        case 'list': {
          const list = token as Tokens.List
          const start = typeof list.start === 'number' ? list.start : 1
          return list.items.flatMap((entry, n) => {
            const marker = entry.task
              ? entry.checked ? '☑' : '☐'
              : list.ordered ? `${start + n}.` : '•'
            return collect(entry.tokens, indent + INDENT, quote, { mark: marker }).map((piece, k): Piece =>
              piece.flow ? { ...piece, tight: n > 0 || k > 0 ? !list.loose : false } : piece
            )
          })
        }
        case 'code':
          return [{
            flow: false,
            node: (
              <ScrollView horizontal style={styles.codeBlock} contentContainerStyle={styles.codeContent}>
                <Block style={[styles.code, { fontSize: size * 0.8 }]}>{token.text}</Block>
              </ScrollView>
            ),
          }]
        case 'hr':
          return [{ flow: false, node: <View style={styles.rule} /> }]
        case 'table': {
          const table = token as Tokens.Table
          const rows = [table.header, ...table.rows]
          // Rows are laid out one by one, so the columns only line up with set widths,
          // guessed from the longest cell.
          const widths = table.header.map((_, c) => {
            const longest = Math.max(...rows.map((row) => row[c]?.text.length ?? 0))
            return Math.min(240, Math.max(60, longest * size * 0.55 + 20))
          })
          return [{
            flow: false,
            node: (
              <ScrollView horizontal style={styles.tableScroll}>
                <View style={styles.table}>
                  {rows.map((row, r) => (
                    <View key={r} style={[styles.tableRow, r > 0 && styles.tableRule]}>
                      {row.map((cell, c) => (
                        <Block
                          key={c}
                          style={[style, styles.cell, r === 0 && styles.strong, { width: widths[c], textAlign: cell.align ?? 'left' }]}
                        >
                          {inline(cell.tokens)}
                        </Block>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            ),
          }]
        }
        default:
          return [{ flow: true, tight: false, node: <Text>{lead}{token.raw.trim()}</Text> }]
      }
    })

  const pieces = collect(tokens, '', false, { mark: null })
  const views: ReactNode[] = []
  let run: ReactNode[] = []
  const flush = () => {
    if (!run.length) return
    views.push(<Block key={views.length} style={style}>{run}</Block>)
    run = []
  }
  pieces.forEach((piece, i) => {
    if (!piece.flow) {
      flush()
      views.push(<Fragment key={views.length}>{piece.node}</Fragment>)
      return
    }
    // The gap between paragraphs is an empty line of its own, set lower than a line of text.
    if (run.length) {
      run.push(piece.tight ? '\n' : <Fragment key={`gap${i}`}>{'\n'}<Text style={{ fontSize: size * 0.4, lineHeight: size * 0.6 }}>{'\n'}</Text></Fragment>)
    }
    run.push(<Fragment key={i}>{piece.node}</Fragment>)
  })
  flush()

  return <View style={[styles.root, { gap: size * 0.6 }]}>{views}</View>
}

export const Markdown = memo(MarkdownView)

// While a reply streams, an action the model has opened but not yet closed would show
// its asterisk and then jump into italics. Closing it early keeps the text steady.
function closeOpenEmphasis(text: string) {
  let out = text.trimEnd()
  if ((out.split('```').length - 1) % 2) return out
  const paragraph = out.slice(out.lastIndexOf('\n\n') + 1)
  const bold = paragraph.split('**').length - 1
  const single = paragraph.replace(/^\s*\* /gm, '').replace(/\*\*/g, '').split('*').length - 1
  if (single % 2) out = out.endsWith('*') && !out.endsWith('**') ? out.slice(0, -1) : `${out}*`
  if (bold % 2) out = out.endsWith('**') ? out.slice(0, -2) : `${out}**`
  return out
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { alignSelf: 'stretch' },
    strong: { fontWeight: '700' },
    em: { fontStyle: 'italic' },
    del: { textDecorationLine: 'line-through' },
    link: { color: colors.accent, textDecorationLine: 'underline' },
    codespan: { fontFamily: CODE_FONT, backgroundColor: colors.surface, color: colors.text },
    heading: { fontWeight: '700' },
    codeBlock: {
      borderRadius: 12,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    codeContent: { paddingHorizontal: 14, paddingVertical: 11 },
    code: { fontFamily: CODE_FONT, color: colors.text, lineHeight: 19 },
    quote: { color: colors.textMuted },
    marker: { color: colors.textMuted, fontStyle: 'normal', fontWeight: '400' },
    rule: { alignSelf: 'center', width: '40%', height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: 6 },
    tableScroll: { flexGrow: 0 },
    table: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
    tableRow: { flexDirection: 'row' },
    tableRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    cell: { paddingHorizontal: 10, paddingVertical: 6 },
  })
