import { Icon } from '@/components/visuals/Icon'
import { Link } from 'expo-router'
import { Children, Fragment, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native'

import type { MenuItem } from '@/components/overlays/NativeMenu'
import { NativeMenu } from '@/components/overlays/NativeMenu'
import { ParamSlider } from '@/components/controls/ParamSlider'
import { Segmented } from '@/components/controls/Segmented'
import { Chip } from '@/components/controls/Chip'
import { FadingRow } from '@/components/controls/ChipGroup'
import { SlidingIcon, useAtLeastOneLap } from '@/components/controls/PillButton'
import { setTextDraft } from '@/lib/chat/textDraft'
import { SFIcon } from '@/components/visuals/SFIcon'
import * as Haptics from '@/lib/ui/haptics'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { isDesktop, isIOS } from '@/lib/core/platform'
import { type Colors, useColors, useStyles } from '@/theme'

// The inset grouped list of the iOS Settings app: a small header over a rounded group of
// rows parted by hairlines, and the explanation in grey under the group.

const INSET = 16
const ROW_HEIGHT = 44

// Fragments are opened up and empty slots dropped, so a hairline goes only between real rows.
function rowsOf(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? rowsOf(child.props.children) : [child],
  )
}

export function ListSection({ header, footer, children }: { header?: string; footer?: ReactNode; children: ReactNode }) {
  const styles = useStyles(createStyles)
  const rows = rowsOf(children)
  return (
    <View style={styles.section}>
      {header ? <Text style={styles.header}>{header}</Text> : null}
      {rows.length > 0 ? (
        <View style={styles.group}>
          {rows.map((row, i) => (
            <View key={i}>
              {i > 0 ? <View style={styles.separator} /> : null}
              {row}
            </View>
          ))}
        </View>
      ) : null}
      {typeof footer === 'string' ? <Text style={styles.footer}>{footer}</Text> : footer}
    </View>
  )
}

// Grey text under a group, for what does not fit the footer prop (a warning, a status line).
export function ListFooter({ children, danger }: { children: ReactNode; danger?: boolean }) {
  const styles = useStyles(createStyles)
  return <Text style={[styles.footer, danger && styles.danger]}>{children}</Text>
}

type CellProps = { label: string; disabled?: boolean }

export function SwitchCell({ label, value, onValueChange, disabled }: CellProps & { value: boolean; onValueChange: (v: boolean) => void }) {
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Text style={styles.label}>{label}</Text>
      <CellSwitch value={value} disabled={disabled} onValueChange={onValueChange} />
    </View>
  )
}

// The system switch. React Native lays a UISwitch out in the 51 x 31 frame of the old one,
// and the iOS 26 switch, 28 pt tall, is drawn from the top of it; the nudge recenters it.
// (SwiftUI's Toggle in a Host stuck to the top of its frame and ignored the tint.)
function CellSwitch({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const colors = useColors()
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        Haptics.selectionAsync()
        onValueChange(v)
      }}
      trackColor={{ true: colors.accent, false: isIOS ? undefined : colors.borderStrong }}
      // react-native-web paints the thumb in its own teal; here it is white either way.
      {...(isDesktop ? ({ thumbColor: '#FFFFFF', activeThumbColor: '#FFFFFF' } as object) : {})}
      style={liquidGlass ? switchNudge : undefined}
    />
  )
}

const switchNudge = { transform: [{ translateY: 1.5 }] }

// A choice among the rows of its group, marked with a checkmark like a ringtone list.
export function CheckCell({ label, checked, onPress, disabled }: CellProps & { checked: boolean; onPress: () => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={() => {
        if (checked) return
        Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
      {checked ? <Icon name="checkmark" size={22} color={colors.accent} /> : null}
    </Pressable>
  )
}

// A row that opens a screen: the current value in grey and a chevron.
export function LinkCell({ label, value, onPress }: CellProps & { value?: string; onPress: () => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Icon name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  )
}

// A row whose value is picked from the system menu.
export function MenuCell({ label, value, placeholder, items }: CellProps & { value: string; placeholder?: string; items: MenuItem[] }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <NativeMenu items={items}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !value && { color: colors.textFaint }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon name="chevron-expand" size={16} color={colors.textFaint} />
      </View>
    </NativeMenu>
  )
}

// A label on the left and the field filling the rest, typed in on the right.
export function InputCell({ label, disabled, ...input }: CellProps & Omit<TextInputProps, 'style'>) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.row, disabled && styles.disabled]} pointerEvents={disabled ? 'none' : 'auto'}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        {...input}
        editable={!disabled}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        style={styles.input}
      />
    </View>
  )
}

// An action row in the tint color, as "Sign Out" in Settings; a spinner while it runs.
// With an icon that slides, the arrow keeps leaving and coming back instead, as on the
// push and pull buttons of the earlier design. The glyph is Ionicons: an SF Symbol in
// a SwiftUI host does not reliably take the accent color.
export function ButtonCell({
  label,
  onPress,
  disabled,
  danger,
  loading,
  icon,
}: CellProps & {
  onPress: () => void
  danger?: boolean
  loading?: boolean
  // `symbol` is the SF Symbol drawn on iOS, `fallback` the icon elsewhere (or everywhere without one).
  icon?: { symbol?: ComponentProps<typeof SFIcon>['name']; fallback: ComponentProps<typeof Icon>['name']; slide?: 'up' | 'down' }
}) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const sliding = useAtLeastOneLap(!!loading && !!icon?.slide)
  const ink = danger ? colors.danger : colors.accent
  return (
    <Pressable
      disabled={disabled || loading || sliding}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && !loading && !sliding && styles.disabled]}
    >
      <Text style={[styles.label, { color: ink }]}>{label}</Text>
      {icon ? (
        <SlidingIcon direction={icon.slide} active={sliding}>
          {icon.symbol ? (
            <SFIcon name={icon.symbol} fallback={icon.fallback} size={20} color={ink} />
          ) : (
            <Icon name={icon.fallback} size={20} color={ink} />
          )}
        </SlidingIcon>
      ) : null}
      {loading && !sliding ? <ActivityIndicator color={colors.textMuted} /> : null}
    </Pressable>
  )
}

// Text typed over several lines right in the group, as a note in a form; it grows with the
// text up to `maxHeight`, then scrolls.
export function AreaCell({ minHeight = 88, maxHeight = 220, ...input }: Omit<TextInputProps, 'style' | 'multiline'> & { minHeight?: number; maxHeight?: number }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={styles.areaRow}>
      <TextInput
        {...input}
        multiline
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        style={[styles.area, { minHeight, maxHeight }]}
      />
    </View>
  )
}

// A choice of a few, as segments under a small caps label, like the sliders.
export function SegmentCell<T extends string>({
  label,
  ...segmented
}: { label: string } & ComponentProps<typeof Segmented<T>>) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.segmentCell}>
      <Text style={styles.capsLabel}>{label}</Text>
      <Segmented {...segmented} />
    </View>
  )
}

// One of many, as plain chips in a row that scrolls sideways under a small caps label: the
// row runs to the edges of the group and fades there while it scrolls.
export function ChipChoiceCell({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={styles.choiceCell}>
      <Text style={[styles.capsLabel, styles.choiceLabel]}>{label}</Text>
      <FadingRow fadeColor={colors.surface} inset={INSET}>
        {options.map((o) => (
          <Chip key={o} label={o} active={o === value} onPress={() => onChange(o)} />
        ))}
      </FadingRow>
    </View>
  )
}

// A slider in a row of its own: the label and the value above the track.
export function SliderCell(props: ComponentProps<typeof ParamSlider>) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.sliderCell}>
      <ParamSlider {...props} />
    </View>
  )
}

// A long text shown by its first lines; a tap opens it for editing on the whole screen
// (app/text-editor.tsx), zooming out of the row on iOS.
export function TextCell({
  title,
  value,
  placeholder,
  onChangeText,
  lines = 4,
}: {
  title: string
  value: string
  placeholder?: string
  onChangeText: (text: string) => void
  lines?: number
}) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  // Runs before the link navigates, so the editor finds the text waiting.
  const prepareEditor = () => setTextDraft({ title, value, placeholder, onChange: onChangeText })
  return (
    <Link href="/text-editor" onPress={prepareEditor} asChild>
      <Link.AppleZoom>
        {/* The look is on a view inside: Link with asChild passes on a plain style but not
            a style function, so the padding was lost on the Pressable itself. */}
        <Pressable accessibilityRole="button" accessibilityLabel={title}>
          <View style={styles.textRow}>
            <Text style={[styles.textPreview, !value && { color: colors.textFaint }]} numberOfLines={lines}>
              {value || placeholder}
            </Text>
            <View style={styles.expand} pointerEvents="none">
              <SFIcon name="arrow.up.left.and.arrow.down.right" fallback="expand-outline" size={15} color={colors.textFaint} />
            </View>
          </View>
        </Pressable>
      </Link.AppleZoom>
    </Link>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    ...baseStyles(colors),
    ...(isDesktop ? desktopOverrides(colors) : {}),
  })

const baseStyles = (colors: Colors) =>
  ({
    section: { marginBottom: 28 },
    header: {
      color: colors.textMuted,
      fontSize: 13,
      textTransform: 'uppercase',
      paddingHorizontal: INSET,
      marginBottom: 7,
    },
    group: { backgroundColor: colors.surface, borderRadius: 26, borderCurve: 'continuous', overflow: 'hidden' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginLeft: INSET },
    footer: { color: colors.textMuted, fontSize: 13, lineHeight: 18, paddingHorizontal: INSET, marginTop: 7 },
    danger: { color: colors.danger },
    row: { minHeight: ROW_HEIGHT + 8, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: INSET, paddingVertical: 8 },
    pressed: { backgroundColor: colors.surfaceRaised },
    disabled: { opacity: 0.4 },
    label: { flex: 1, color: colors.text, fontSize: 17 },
    value: { color: colors.textMuted, fontSize: 17, flexShrink: 1, maxWidth: '55%' },
    inputLabel: { color: colors.text, fontSize: 17 },
    input: { flex: 1, color: colors.text, fontSize: 17, textAlign: 'right', paddingVertical: 0 },
    sliderCell: { paddingHorizontal: INSET, paddingTop: 12 },
    segmentCell: { paddingHorizontal: INSET, paddingTop: 12, paddingBottom: 14, gap: 10 },
    choiceCell: { paddingTop: 12, paddingBottom: 14, gap: 10 },
    choiceLabel: { paddingHorizontal: INSET },
    // The caps label of ParamSlider, for the rows that stand beside sliders.
    capsLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    areaRow: { paddingHorizontal: INSET, paddingVertical: 12 },
    area: { color: colors.text, fontSize: 17, lineHeight: 22, padding: 0, textAlignVertical: 'top' },
    // The text starts where the label of a one-line row does; the right side keeps room
    // for the expand mark in the corner.
    textRow: { minHeight: ROW_HEIGHT + 8, paddingVertical: 15, paddingLeft: INSET, paddingRight: INSET + 28 },
    textPreview: { color: colors.text, fontSize: 17, lineHeight: 22 },
    expand: { position: 'absolute', top: 12, right: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  }) as const

// Desktop settings: a section title in plain bold text, groups in the secondary
// grey with a modest rounding, smaller text, and hairlines from edge to edge.
const desktopOverrides = (colors: Colors) => ({
  section: { marginBottom: 24 },
  header: { color: colors.text, fontSize: 15, fontWeight: '600' as const, paddingHorizontal: 16, marginBottom: 10 },
  group: { backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' as const },
  separator: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  footer: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17, paddingHorizontal: 16, marginTop: 8 },
  row: { minHeight: 52, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  pressed: { backgroundColor: colors.surfaceRaised },
  label: { flex: 1, color: colors.text, fontSize: 14 },
  value: { color: colors.textMuted, fontSize: 14, flexShrink: 1, maxWidth: '55%' as const },
  inputLabel: { color: colors.text, fontSize: 14 },
  input: { flex: 1, color: colors.text, fontSize: 14, textAlign: 'right' as const, paddingVertical: 0 },
  sliderCell: { paddingHorizontal: 20, paddingTop: 12 },
  segmentCell: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, gap: 10 },
  areaRow: { paddingHorizontal: 20, paddingVertical: 12 },
  area: { color: colors.text, fontSize: 14, lineHeight: 20, padding: 0, textAlignVertical: 'top' as const },
  textRow: { minHeight: 52, paddingVertical: 16, paddingLeft: 20, paddingRight: 48 },
  textPreview: { color: colors.text, fontSize: 14, lineHeight: 20 },
})

