import { memo, useMemo, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { SvgXml } from 'react-native-svg'

import { texToSvg, type MathSvg } from '@/lib/chat/mathSvg'
import { texToUnicode } from '@/lib/chat/tex'

// TeX's letters are short for their em beside the system font's; set a little larger,
// their lowercase stands as tall as the text's.
const SCALE = 1.15
// Room above and below a formula, so it does not touch the lines around it.
const PAD = 4

// The character that holds a formula's place in the text: an empty line as tall as
// the formula, which the selection runs through and the formula is laid over (LineLayer).
export const LINE_MARK = String.fromCharCode(0x200b)
// A rule keeps its place with its own Markdown, unseen, so a copied selection that runs
// through it still parts the text as the reply did.
export const RULE_TEXT = '---'

// The height of the line a formula takes, or null when MathJax cannot read it.
export function mathLineHeight(tex: string, fontSize: number) {
  const svg = texToSvg(tex)
  return svg && Math.ceil(svg.height * fontSize * SCALE) + PAD * 2
}

// A formula of its own line, centered, in the color and at the size of the text around
// it. One wider than the message scrolls sideways, as a code block does.
function MathBlockView({ tex, style }: { tex: string; style: StyleProp<TextStyle> }) {
  const flat = StyleSheet.flatten(style) ?? {}
  const svg = useMemo(() => texToSvg(tex), [tex])
  const label = useMemo(() => texToUnicode(tex), [tex])

  // A formula MathJax cannot read is still shown, as plain characters.
  if (!svg) return <Text style={[style, styles.fallback]}>{label}</Text>
  return <Formula svg={svg} label={label} color={flat.color} size={(flat.fontSize ?? 17) * SCALE} />
}

export const MathBlock = memo(MathBlockView)

function Formula({ svg, label, color, size }: { svg: MathSvg; label: string; color: unknown; size: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <SvgXml xml={svg.xml} color={color as string | undefined} width={svg.width * size} height={svg.height * size} />
    </ScrollView>
  )
}

type Line = { y: number; height: number }

// What stands in a run of text without being text, a formula or a rule, laid over the
// lines kept for it, one layer to a line of LINE_MARK or RULE_TEXT in their order. A
// read-only UITextView tells nothing of where its lines are, so the same text is laid
// out once more, unseen, by a Text that does.
export function LineLayer({ children, style, layers }: { children: ReactNode; style: StyleProp<TextStyle>; layers: ReactNode[] }) {
  const [lines, setLines] = useState<Line[]>([])

  return (
    <>
      <Text
        style={[style, styles.measure]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onTextLayout={(e) => {
          const found = e.nativeEvent.lines.filter((line) => line.text.includes(LINE_MARK) || line.text.trim() === RULE_TEXT).map(({ y, height }) => ({ y, height }))
          setLines((prev) =>
            prev.length === found.length && prev.every((line, i) => line.y === found[i].y && line.height === found[i].height) ? prev : found
          )
        }}
      >
        {children}
      </Text>
      {layers.map((layer, i) =>
        lines[i] ? (
          <View key={i} style={[styles.over, { top: lines[i].y, height: lines[i].height }]}>
            {layer}
          </View>
        ) : null
      )}
    </>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 2 },
  fallback: { textAlign: 'center' },
  measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0, pointerEvents: 'none' },
  over: { position: 'absolute', left: 0, right: 0, justifyContent: 'center' },
})
