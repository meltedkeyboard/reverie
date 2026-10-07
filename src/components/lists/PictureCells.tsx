import { useState, type ComponentProps } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { GlassMerge } from '@/components/chrome/Glass'
import { Chip } from '@/components/controls/Chip'
import type { BackgroundEffect } from '@/db/characters'
import { useTranslation } from '@/i18n'
import type { ImageSource } from '@/lib/images/images'
import { isWeb } from '@/lib/core/platform'
import { type Colors, useStyles } from '@/theme'

import { ButtonCell, ListSection } from './GroupedList'

// The cells of the grouped list that deal with a picture: where it comes from, and what is
// done with it once there is one. Shared by the character and the room editors.

type ChipAction = {
  label: string
  icon: NonNullable<ComponentProps<typeof Chip>['icon']>
  onPress: () => void
  ink?: string
}

// Icon chips that share the width of the row and melt into each other when pressed.
export function ChipRowCell({ actions }: { actions: ChipAction[] }) {
  const styles = useStyles(createStyles)
  return (
    <GlassMerge style={styles.chips}>
      {actions.map((action) => (
        <Chip key={action.label} {...action} active={false} interactive style={styles.chip} />
      ))}
    </GlassMerge>
  )
}

// Where a picture comes from: a button that fades away and leaves the sources behind as
// chips, with no sheet or menu in between (the system menu jumps behind the scroll as it
// closes on iOS 26 and 27). The desktop has only files to choose from, so it keeps the button.
export function SourceCell({ label, onPick }: { label: string; onPick: (source: ImageSource) => void }) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // The chips lie under the button from the start, so the row keeps its height, and the
  // button, on the solid fill of the group, fades away over them. The chips themselves are
  // never faded: Liquid Glass is not drawn under an ancestor with opacity.
  const shown = useSharedValue(0)
  const buttonStyle = useAnimatedStyle(() => ({ opacity: 1 - shown.value }))
  if (isWeb) return <ButtonCell label={label} onPress={() => onPick('files')} />
  const toggle = (next: boolean) => {
    setOpen(next)
    shown.value = withTiming(next ? 1 : 0, { duration: 220 })
  }
  const pick = (source: ImageSource) => {
    toggle(false)
    onPick(source)
  }
  return (
    <View>
      <View pointerEvents={open ? 'auto' : 'none'}>
        <ChipRowCell
          actions={[
            { label: t('imageSource.camera'), icon: { symbol: 'camera', fallback: 'camera-outline' }, onPress: () => pick('camera') },
            { label: t('imageSource.photos'), icon: { symbol: 'photo.on.rectangle', fallback: 'images-outline' }, onPress: () => pick('library') },
            { label: t('imageSource.files'), icon: { symbol: 'folder', fallback: 'folder-outline' }, onPress: () => pick('files') },
          ]}
        />
      </View>
      <Animated.View style={[styles.cover, buttonStyle]} pointerEvents={open ? 'none' : 'auto'}>
        <ButtonCell label={label} onPress={() => toggle(true)} />
      </Animated.View>
    </View>
  )
}

// The chat background of a character or a room: its preview with the effect on, where a new
// one comes from, and reframing or removing the one there is.
export function BackgroundSection({
  uri,
  effect,
  intensity,
  onPick,
  onAdjust,
  onClear,
}: {
  uri: string | null
  effect: BackgroundEffect
  intensity: number
  onPick: (source: ImageSource) => void
  onAdjust: () => void
  onClear: () => void
}) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  return (
    <ListSection header={t('background.title')}>
      {uri ? (
        <View style={styles.thumbCell}>
          <View style={styles.thumb}>
            <ChatBackground uri={uri} effect={effect} intensity={intensity} />
          </View>
        </View>
      ) : null}
      <SourceCell label={uri ? t('background.change') : t('background.choose')} onPick={onPick} />
      {uri ? <ButtonCell label={t('background.adjust')} onPress={onAdjust} /> : null}
      {uri ? <ButtonCell danger label={t('background.remove')} onPress={onClear} /> : null}
    </ListSection>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    chip: { flex: 1 },
    cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', backgroundColor: colors.surface },
    thumbCell: { alignItems: 'center', paddingVertical: 12 },
    thumb: {
      width: 90,
      height: 120,
      borderRadius: 14,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
  })
