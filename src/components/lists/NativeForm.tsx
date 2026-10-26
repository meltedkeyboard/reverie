import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

// A type only: the package itself is loaded through nativeUI where it is present.
import type { ObservableState, ViewModifier } from '@expo/ui/swift-ui/modifiers'

import { swiftUI } from '@/lib/ui/nativeUI'
import { useTheme } from '@/theme'

// The grouped list of the iOS Settings app as the system itself draws it, a SwiftUI Form: its
// rows highlight on the touch and fade back on the UI thread, the checks, switches, sliders and
// menus are the system's own, and it scrolls natively. Null without SwiftUI (Expo Go, Android,
// the desktop), where a screen keeps GroupedList.
//
// What a row of the list holds takes the list's foreground, whatever a view inside asks for:
// a picker draws only the text of its options, in the text's color, and a button paints all
// of its label in its tint. So a label that is not the accent is a button tinted otherwise,
// and what is grey (a value, a chevron) stands beside the button rather than in it.
export const nativeForm = swiftUI

// The whole screen's list, in the theme's colors: the page's background behind it and the
// accent on its controls. It keeps the safe area, so its content starts under a native header;
// under one the screen draws itself, the first section takes `inset`. `jumpTo`, with ids on
// the sections, scrolls to the one it is set to. `clear` leaves out the page's background, for
// what the screen draws behind the list, and `modifiers` go on the list after its own.
export function NativeForm({
  jumpTo,
  clear = false,
  modifiers = [],
  children,
}: {
  jumpTo?: ObservableState<string | null>
  clear?: boolean
  modifiers?: ViewModifier[]
  children: ReactNode
}) {
  const { colors, scheme } = useTheme()
  const { Host, Form } = nativeForm!.ui
  const { scrollContentBackground, background, tint, scrollPosition, scrollDismissesKeyboard } = nativeForm!.modifiers
  return (
    <Host style={styles.host} colorScheme={scheme} seedColor={colors.accent}>
      <Form
        modifiers={[
          scrollContentBackground('hidden'),
          ...(clear ? [] : [background(colors.bg)]),
          tint(colors.accent),
          // The number pad has no key to close it: the keyboard goes down with the list as
          // it is dragged, as under the old scroll view.
          scrollDismissesKeyboard('interactively'),
          ...(jumpTo ? [scrollPosition(jumpTo, { anchor: 'top' })] : []),
          ...modifiers,
        ]}
      >
        {children}
      </Form>
    </Host>
  )
}

// The room the list leaves above its first section, which a sheet with its own controls
// above the list takes back by laying the list's top under them.
export const LIST_TOP = 35

// The list of a screen of a sheet, under the sheet's bar, over what the sheet draws, its
// groups as near each other as the app's cards stood. Its first group takes `top` to come as
// near the bar. Pulled up under the bar instead, the list had the bar take it for content
// scrolled under it, and the bar drew its edge.
export function NativeSheetForm({ children }: { children: ReactNode }) {
  const { listSectionSpacing } = nativeForm!.modifiers
  return (
    <NativeForm clear modifiers={[listSectionSpacing(SHEET_GAP)]}>
      {children}
    </NativeForm>
  )
}

const SHEET_GAP = 12

type Footer = string | { text: string; danger?: boolean }[]

// A group of rows on the theme's surface, with the header over it and the note under it: a
// string, or lines of which some are warnings in red. `inset` is room above it for a header
// drawn over the list, and `id` the name a jump finds it by. `top`, on the first group of a
// sheet's list, is the room above it in place of the list's own (iOS 26).
export function NativeSection({
  title,
  footer,
  inset,
  id: name,
  fill,
  top,
  children,
}: {
  title?: string
  footer?: Footer
  inset?: number
  id?: string
  // The rows' color where it is not the theme's surface, as the cards of a sheet.
  fill?: string
  top?: boolean
  children: ReactNode
}) {
  const { colors } = useTheme()
  const { Section, Text, VStack, ZStack } = nativeForm!.ui
  const { listRowBackground, foregroundStyle, frame, id, listSectionMargins } = nativeForm!.modifiers
  const lines = typeof footer === 'string' ? [{ text: footer }] : (footer ?? [])
  const header =
    inset !== undefined ? (
      <VStack alignment="leading" spacing={0}>
        <ZStack modifiers={[frame({ height: inset })]}>
          <Text> </Text>
        </ZStack>
        {title ? <Text>{title}</Text> : null}
      </VStack>
    ) : undefined
  return (
    <Section
      title={header ? undefined : title}
      header={header}
      footer={
        lines.length ? (
          <VStack alignment="leading" spacing={6}>
            {lines.map((line, i) => (
              <Text key={i} modifiers={line.danger ? [foregroundStyle(colors.danger)] : []}>
                {line.text}
              </Text>
            ))}
          </VStack>
        ) : undefined
      }
      modifiers={[
        listRowBackground(fill ?? colors.surface),
        ...(name ? [id(name)] : []),
        ...(top ? [listSectionMargins({ edges: 'top', length: SHEET_GAP })] : []),
      ]}
    >
      {children}
    </Section>
  )
}

// A row that is a React Native view, laid edge to edge in its row: what the system has no
// control for (a preview, a strip of tiles, a row of chips). Without `height` it is as tall as
// the view lays itself out. When rows above it in its section come and go, it needs a key that
// changes with them: the list remakes the rows after the change, and the view hosted in the old
// row goes away with it, leaving the new row blank.
export function NativeHostedRow({ height, clear = false, children }: { height?: number; clear?: boolean; children: React.ReactElement }) {
  const [measured, setMeasured] = useState(0)
  const { ZStack, RNHostView } = nativeForm!.ui
  const { frame, listRowInsets, listRowBackground } = nativeForm!.modifiers
  const rowHeight = height ?? measured
  return (
    <ZStack
      modifiers={[
        frame({ height: Math.max(1, rowHeight) }),
        listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }),
        ...(clear ? [listRowBackground('#00000000')] : []),
      ]}
    >
      <RNHostView>
        {height !== undefined ? (
          children
        ) : (
          <View style={styles.measure}>
            <View onLayout={(e) => setMeasured(Math.ceil(e.nativeEvent.layout.height))}>{children}</View>
          </View>
        )}
      </RNHostView>
    </ZStack>
  )
}

// A row that opens another screen: its name, the value in grey and a chevron, as a navigation
// row of Settings, the whole row highlighting on a tap. `symbol` stands before the name, in
// the name's color.
export function NativeLinkRow({ label, value, symbol, onPress }: { label: string; value?: string; symbol?: string; onPress: () => void }) {
  const { colors } = useTheme()
  const { Button, HStack, Spacer, Text, Image } = nativeForm!.ui
  const { tint, foregroundStyle, lineLimit } = nativeForm!.modifiers
  return (
    <HStack spacing={8}>
      <Button label={label} systemImage={symbol as never} onPress={onPress} modifiers={[tint(colors.text)]} />
      <Spacer />
      {value ? <Text modifiers={[foregroundStyle(colors.textMuted), lineLimit(1)]}>{value}</Text> : null}
      <Image systemName="chevron.right" size={13} color={colors.textFaint} />
    </HStack>
  )
}

type Effect = Parameters<NonNullable<typeof swiftUI>['modifiers']['symbolEffect']>[0]

// A row that does something: its symbol and name in the accent, or in red when it destroys.
// While it works it cannot be pressed again, and its symbol plays `effect` instead of a
// spinner standing beside it.
export function NativeActionRow({
  label,
  symbol,
  effect = { effect: 'pulse' },
  busy = false,
  disabled = false,
  destructive = false,
  onPress,
}: {
  label: string
  symbol?: string
  effect?: Effect
  busy?: boolean
  disabled?: boolean
  destructive?: boolean
  onPress: () => void
}) {
  const { Button, useNativeState } = nativeForm!.ui
  const { disabled: off, symbolEffect } = nativeForm!.modifiers
  const running = useNativeState(busy)
  useEffect(() => {
    running.set(busy)
  }, [running, busy])
  return (
    <Button
      label={label}
      systemImage={symbol as never}
      role={destructive ? 'destructive' : undefined}
      onPress={onPress}
      modifiers={[off(disabled || busy), ...(symbol ? [symbolEffect(effect, { isActive: running, options: { repeat: 'continuous' } })] : [])]}
    />
  )
}

// A field in a row: the label at the left and what is typed at the right, as the fields of
// Settings. The field keeps what is typed, which may be on the way to a value (an emptied
// number); it is set from `value` only when that changes from outside.
export function NativeTextRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboard = 'default',
  secure = false,
  plain = false,
  capitalize,
  disabled = false,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboard?: 'default' | 'url' | 'number-pad'
  secure?: boolean
  // No capitals or corrections: an address, a key, a model's name.
  plain?: boolean
  // Capitals at the start of every word, as in a person's name.
  capitalize?: 'words'
  disabled?: boolean
}) {
  const { colors } = useTheme()
  const { HStack, Text, TextField, SecureField, useNativeState } = nativeForm!.ui
  const { multilineTextAlignment, keyboardType, textInputAutocapitalization, autocorrectionDisabled, disabled: off, foregroundStyle } = nativeForm!.modifiers
  const text = useNativeState(value)
  useEffect(() => {
    if (text.get() !== value) text.set(value)
  }, [text, value])
  const modifiers = [
    multilineTextAlignment('trailing'),
    foregroundStyle(colors.textMuted),
    ...(keyboard === 'url' ? [keyboardType('url')] : keyboard === 'number-pad' ? [keyboardType('ascii-capable-number-pad')] : []),
    ...(plain || secure ? [textInputAutocapitalization('never'), autocorrectionDisabled()] : capitalize ? [textInputAutocapitalization(capitalize)] : []),
  ]
  return (
    <HStack spacing={12} modifiers={[off(disabled)]}>
      <Text>{label}</Text>
      {secure ? (
        <SecureField text={text} placeholder={placeholder} onTextChange={onChangeText} modifiers={modifiers} />
      ) : (
        <TextField text={text} placeholder={placeholder} onTextChange={onChangeText} modifiers={modifiers} />
      )}
    </HStack>
  )
}

// A field of several lines, as a note in Settings: it is `lines` tall when empty and grows
// with what is typed up to `maxLines`, then scrolls; with `maxLines` null it grows as long as
// the text is. The list moves the rows under it and keeps it over the keyboard. As
// NativeTextRow, it is set from `value` only when that changes from outside (a preset picked,
// a version switched).
export function NativeAreaRow({
  label,
  value,
  onChangeText,
  placeholder,
  lines = 4,
  maxLines = 10,
}: {
  label?: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  lines?: number
  maxLines?: number | null
}) {
  const { TextField, Text, VStack, useNativeState } = nativeForm!.ui
  const { lineLimit } = nativeForm!.modifiers
  const text = useNativeState(value)
  useEffect(() => {
    if (text.get() !== value) text.set(value)
  }, [text, value])
  const field = (
    <TextField
      text={text}
      axis="vertical"
      placeholder={placeholder}
      onTextChange={onChangeText}
      modifiers={maxLines === null ? [] : [lineLimit({ min: lines, max: maxLines })]}
    />
  )
  if (!label) return field
  return (
    <VStack alignment="leading" spacing={6}>
      <Text>{label}</Text>
      {field}
    </VStack>
  )
}

// A slider in a row of its own: the name and the value over the track. With `step` the
// system's slider stops on each step and, on iOS 26, ticks under the finger as it passes one;
// without it the track runs freely and `onChange` puts the value where it should be.
export function NativeSliderRow({
  label,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
  onEditing,
  tintColor,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (value: number) => string
  onChange: (value: number) => void
  // When the finger takes the thumb and lets it go.
  onEditing?: (editing: boolean) => void
  tintColor?: string
}) {
  const { colors } = useTheme()
  const { VStack, HStack, Spacer, Text, Slider } = nativeForm!.ui
  const { foregroundStyle, monospacedDigit, tint } = nativeForm!.modifiers
  return (
    <VStack alignment="leading" spacing={6}>
      <HStack>
        <Text>{label}</Text>
        <Spacer />
        <Text modifiers={[foregroundStyle(tintColor ?? colors.textMuted), monospacedDigit()]}>{format(value)}</Text>
      </HStack>
      <Slider value={value} min={min} max={max} step={step} onValueChange={onChange} onEditingChanged={onEditing} modifiers={tintColor ? [tint(tintColor)] : []} />
    </VStack>
  )
}

// A slider of many steps, whose value is put on a step while its track runs freely: the
// system's slider ticks at every step it passes, a rattle under a fast swipe over dozens of
// them. The thumb keeps where the finger left it, since handing the stepped value back would
// pull it to the step under the finger. `format` shows the stepped value.
export function NativeFreeSliderRow({
  value,
  min,
  step,
  format = (v) => String(v),
  onChange,
  ...rest
}: Omit<React.ComponentProps<typeof NativeSliderRow>, 'step'> & { step: number }) {
  const [thumb, setThumb] = useState(value)
  // Rounded past the step, so that steps of a fraction do not come out as 0.15000000000000002.
  const snap = (v: number) => Number((min + Math.round((v - min) / step) * step).toFixed(6))
  // A value set from outside (loaded, reset) moves the thumb.
  const shown = snap(thumb) === value ? thumb : value
  return (
    <NativeSliderRow
      {...rest}
      min={min}
      value={shown}
      format={(v) => format(snap(v))}
      onChange={(v) => {
        setThumb(v)
        if (snap(v) !== value) onChange(snap(v))
      }}
    />
  )
}

// Two or three choices as the system's segments, under their name.
export function NativeSegmentRow<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const { VStack, Text, Picker } = nativeForm!.ui
  const { pickerStyle, labelsHidden, tag } = nativeForm!.modifiers
  return (
    <VStack alignment="leading" spacing={10}>
      <Text>{label}</Text>
      <Picker selection={value} onSelectionChange={(next: T) => onChange(next)} modifiers={[pickerStyle('segmented'), labelsHidden()]}>
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </VStack>
  )
}

// A picker in a row: the label at the left and the choice popped from the system's menu at the right.
export function NativePickerRow<T extends string>({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[] | T[]
  placeholder?: string
  onChange: (value: T) => void
}) {
  const { Picker, Text } = nativeForm!.ui
  const { pickerStyle, tag } = nativeForm!.modifiers
  const items = options.map((opt) => (typeof opt === 'string' ? { value: opt as T, label: opt } : opt))
  const hasValue = items.some((item) => item.value === value)
  return (
    <Picker label={label} selection={value} onSelectionChange={(next: T) => onChange(next)} modifiers={[pickerStyle('menu')]}>
      {placeholder && !hasValue ? (
        <Text key="" modifiers={[tag('' as T)]}>
          {placeholder}
        </Text>
      ) : null}
      {items.map((item) => (
        <Text key={item.value} modifiers={[tag(item.value)]}>
          {item.label}
        </Text>
      ))}
    </Picker>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  // The hosted view at its own height, measured, rather than stretched to the row's.
  measure: { position: 'absolute', top: 0, left: 0, right: 0 },
})
