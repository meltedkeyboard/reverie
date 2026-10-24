import { Fragment, useState, type ReactElement, type ReactNode } from 'react'

import { AreaCell, InputCell, ListFooter, ListSection, SegmentCell, SliderCell, SwitchCell } from '../lists/GroupedList'
import { NativeAreaRow, NativeHostedRow, NativeSection, NativeSegmentRow, NativeSliderRow, NativeTextRow, nativeForm } from '../lists/NativeForm'

// The generator sheets are the system's own list where there is SwiftUI (iOS), GroupedList
// elsewhere. These cells are one or the other, so that a generator composes its page once
// for both; GenSheet puts them in a NativeForm or a scroll view to match.
export const nativeGen = nativeForm !== null

type Footer = string | { text: string; danger?: boolean }[]

// A group with its header and the note under it: a string, or lines of which some are
// warnings in red.
export function GenSection({ header, footer, children }: { header?: string; footer?: Footer; children: ReactNode }) {
  if (nativeGen) {
    return (
      <NativeSection title={header} footer={footer}>
        {children}
      </NativeSection>
    )
  }
  return (
    <ListSection
      header={header}
      footer={
        typeof footer === 'string'
          ? footer
          : footer?.map((line, i) => (
              <ListFooter key={i} danger={line.danger}>
                {line.text}
              </ListFooter>
            ))
      }
    >
      {children}
    </ListSection>
  )
}

// What the system has no row for (chips, the photos, a status), a React Native view in a
// row of its own. Where rows above it come and go it needs a key that changes with them
// (see NativeHostedRow).
export function GenRow({ children }: { children: ReactElement }) {
  return nativeGen ? <NativeHostedRow>{children}</NativeHostedRow> : <Fragment>{children}</Fragment>
}

export function GenSwitch({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  if (!nativeGen) return <SwitchCell label={label} value={value} onValueChange={onValueChange} />
  const { Toggle } = nativeForm!.ui
  return <Toggle label={label} isOn={value} onIsOnChange={onValueChange} />
}

export function GenSegment<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  if (nativeGen) return <NativeSegmentRow label={label} options={options} value={value} onChange={onChange} />
  return <SegmentCell label={label} options={options} value={value} onChange={onChange} />
}

// A field of several lines; `minHeight` is the height of the empty one, in lines of the
// system's field.
export function GenArea({ value, onChangeText, placeholder, minHeight = 88 }: { value: string; onChangeText: (text: string) => void; placeholder?: string; minHeight?: number }) {
  if (nativeGen) return <NativeAreaRow value={value} onChangeText={onChangeText} placeholder={placeholder} lines={Math.round(minHeight / 22)} />
  return <AreaCell value={value} onChangeText={onChangeText} placeholder={placeholder} minHeight={minHeight} />
}

export function GenInput({
  label,
  value,
  onChangeText,
  placeholder,
  numeric = false,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  numeric?: boolean
}) {
  if (nativeGen) {
    return <NativeTextRow label={label} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboard={numeric ? 'number-pad' : 'default'} />
  }
  return <InputCell label={label} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={numeric ? 'number-pad' : undefined} />
}

export function GenSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  if (nativeGen) return <NativeFreeSlider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
  return <SliderCell label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
}

// The limits have dozens of steps, and the system's slider ticks at every one it passes, a
// rattle under a fast swipe. So its track runs freely and the value is put on a step; the
// thumb keeps where the finger left it, since handing the stepped value back would pull it
// to the step under the finger.
function NativeFreeSlider({ value, step, min, onChange, ...rest }: React.ComponentProps<typeof GenSlider>) {
  const [thumb, setThumb] = useState(value)
  const snap = (v: number) => min + Math.round((v - min) / step) * step
  // A value set from outside (loaded from the database) moves the thumb.
  const shown = snap(thumb) === value ? thumb : value
  return (
    <NativeSliderRow
      {...rest}
      min={min}
      value={shown}
      format={(v) => String(snap(v))}
      onChange={(v) => {
        setThumb(v)
        if (snap(v) !== value) onChange(snap(v))
      }}
    />
  )
}
