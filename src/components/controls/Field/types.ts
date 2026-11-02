import type { ReactNode } from 'react'
import type { StyleProp, TextInputProps, TextStyle } from 'react-native'

export type FieldProps = TextInputProps & {
  label?: string
  hint?: string
}

export type FieldLabelProps = {
  children: ReactNode
  style?: StyleProp<TextStyle>
}

export type FieldHintProps = {
  children: ReactNode
  style?: StyleProp<TextStyle>
}
