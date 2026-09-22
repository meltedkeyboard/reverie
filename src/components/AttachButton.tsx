import Ionicons from '@expo/vector-icons/Ionicons'
import { useMemo } from 'react'
import { Platform, Pressable, StyleSheet } from 'react-native'

import { useTranslation } from '@/i18n'
import { useColors } from '@/theme'

import { GlassSurface } from './Glass'
import { NativeMenu } from './NativeMenu'

export type AttachSource = 'library' | 'camera'

type Props = {
  disabled: boolean
  onPick: (source: AttachSource) => void
}

export function AttachButton({ disabled, onPick }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation()
  const circle = (
    <GlassSurface style={styles.circle} fallbackStyle={styles.solid}>
      <Ionicons name="add" size={24} color={colors.text} />
    </GlassSurface>
  )

  // A browser has no separate camera flow, the file dialog covers it.
  if (Platform.OS === 'web') {
    return (
      <Pressable
        onPress={() => onPick('library')}
        disabled={disabled}
        hitSlop={6}
        style={({ pressed }) => (pressed || disabled) && { opacity: 0.55 }}
      >
        {circle}
      </Pressable>
    )
  }

  return (
    <NativeMenu
      disabled={disabled}
      style={disabled && { opacity: 0.55 }}
      items={[
        { label: t('attach.choosePhoto'), systemImage: 'photo.on.rectangle', onSelect: () => onPick('library') },
        { label: t('attach.takePhoto'), systemImage: 'camera', onSelect: () => onPick('camera') },
      ]}
    >
      {circle}
    </NativeMenu>
  )
}

// The same 44 pt as the message field next to it.
const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
})
