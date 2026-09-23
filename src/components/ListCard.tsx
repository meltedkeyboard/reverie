import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

import { useColors, useStyles, type Colors } from '@/theme'

import { IconButton } from './IconButton'

type Props = {
  onOpen: () => void
  onMenu: () => void
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

// A tappable card in a list with a menu behind the trailing ellipsis or a long press.
export function ListCard({ onOpen, onMenu, style, children }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onMenu}
      style={({ pressed }) => [styles.card, style, pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 }]}
    >
      {children}
      <IconButton name="ellipsis-horizontal" size={18} color={colors.textFaint} onPress={onMenu} />
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingVertical: 14,
      paddingLeft: 16,
      paddingRight: 6,
    },
  })
