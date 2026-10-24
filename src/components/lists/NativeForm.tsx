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

type Footer = string | { text: string; danger?: boolean }[]

// A group of rows on the theme's surface, with the header over it and the note under it: a
// string, or lines of which some are warnings in red. `inset` is room above it for a header
// drawn over the list, and `id` the name a jump finds it by.
export function NativeSection({ title, footer, inset, id: name, children }: { title?: string; footer?: Footer; inset?: number; id?: string; children: ReactNode }) {
  const { colors } = useTheme()
  const { Section, Text, VStack, ZStack } = nativeForm!.ui
  const { listRowBackground, foregroundStyle, frame, id } = nativeForm!.modifiers
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
      modifiers={[listRowBackground(colors.surface), ...(name ? [id(name)] : [])]}
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
// row of Settings, the whole row highlighting on a tap.
export function NativeLinkRow({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  const { colors } = useTheme()
  const { Button, HStack, Spacer, Text, Image } = nativeForm!.ui
  const { tint, foregroundStyle, lineLimit } = nativeForm!.modifiers
  return (
    <HStack spacing={8}>
      <Button label={label} onPress={onPress} modifiers={[tint(colors.text)]} />
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

// A slider in a row of its own: the name and the value over the track.
export function NativeSliderRow({
  label,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
  tintColor,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (value: number) => string
  onChange: (value: number) => void
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
      <Slider value={value} min={min} max={max} step={step} onValueChange={onChange} modifiers={tintColor ? [tint(tintColor)] : []} />
    </VStack>
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

const styles = StyleSheet.create({
  host: { flex: 1 },
  // The hosted view at its own height, measured, rather than stretched to the row's.
  measure: { position: 'absolute', top: 0, left: 0, right: 0 },
})
