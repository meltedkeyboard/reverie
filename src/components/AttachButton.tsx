import Ionicons from '@expo/vector-icons/Ionicons'
import { Platform, Pressable, View } from 'react-native'

import { useTranslation } from '@/i18n'
import { useColors } from '@/theme'

import { GlassSurface, useGlassStyles } from './Glass'
import { NativeMenu, nativeMenuGlass } from './NativeMenu'

export type AttachSource = 'library' | 'camera'

type Props = {
  disabled: boolean
  onPick: (source: AttachSource) => void
}

export function AttachButton({ disabled, onPick }: Props) {
  const colors = useColors()
  const styles = useGlassStyles()
  const { t } = useTranslation()
  const icon = <Ionicons name="add" size={24} color={colors.text} />
  const circle = (
    <GlassSurface style={styles.circle} fallbackStyle={styles.solid}>
      {icon}
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
      // With Liquid Glass the menu draws the circle's glass and hosts the icon inside
      // its label, so the menu morphs out of the button.
      glassRadius={22}
      style={disabled && { opacity: 0.55 }}
      items={[
        { label: t('attach.choosePhoto'), systemImage: 'photo.on.rectangle', onSelect: () => onPick('library') },
        { label: t('attach.takePhoto'), systemImage: 'camera', onSelect: () => onPick('camera') },
      ]}
    >
      {nativeMenuGlass ? <View style={styles.circle}>{icon}</View> : circle}
    </NativeMenu>
  )
}
