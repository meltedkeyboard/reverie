export type SegmentOption<T extends string> = {
  value: T
  label: string
}

export type SegmentedProps<T extends string> = {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}
