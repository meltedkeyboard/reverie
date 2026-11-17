import { Icon } from '@/components/visuals/Icon'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { FloorMode, RoomMember } from '@/db/rooms'
import { useTranslation } from '@/i18n'
import { swiftUI } from '@/lib/ui/nativeUI'
import { CONTROL_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

import { NativeMenu, type MenuItem } from '../overlays/NativeMenu'

type Props = {
  members: RoomMember[]
  // Who the next message goes to; empty is the whole room.
  addressees: number[]
  whisper: boolean
  narration: boolean
  // Opens the cast sheet, where the addressees, the narrator and the whisper are picked
  // and people walk in and out.
  onOpen: () => void
  floor?: FloorMode
}

// Who a room's message goes to, as a pop-up button in the composer's lower tier: the
// same height as the send button across from it.
export function CastBar({ members, addressees, whisper, narration, onOpen }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const picked = narration ? [] : members.filter((m) => addressees.includes(m.characterId))
  const hushed = whisper && picked.length > 0
  const label = narration
    ? t('room.narration')
    : picked.length
      ? picked.map((m) => m.character.name).join(', ')
      : t('room.everyone')
  const on = picked.length > 0 || narration

  return (
    <Pressable
      onPress={onOpen}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${t('room.castTitle')}: ${hushed ? t('room.whisperTo', { names: label }) : label}`}
      style={({ pressed }) => [styles.button, on && styles.buttonOn, pressed && styles.pressed]}
    >
      {hushed ? <Icon name="lock-closed" size={13} color={colors.accent} /> : null}
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const FLOORS: FloorMode[] = ['addressee', 'reactions', 'open']

export const FLOOR_ICONS = {
  addressee: { icon: 'person-outline', sf: 'person' },
  reactions: { icon: 'chatbubbles-outline', sf: 'bubble.left.and.bubble.right' },
  open: { icon: 'mic-outline', sf: 'mic' },
} as const

// The floor mode next to the cast button: the icon says which one is on, and on iOS the
// system menu grows out of the button, the current mode ticked in place of its symbol.
export function FloorButton({ floor, onChange }: { floor: FloorMode; onChange: (mode: FloorMode) => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const items: MenuItem[] = FLOORS.map((mode) => ({
    // The action sheet elsewhere has no ticks, so the current mode is named instead.
    label: `${t(`room.floor.${mode}`)}${!swiftUI && mode === floor ? t('room.floorCurrent') : ''}`,
    systemImage: mode === floor ? 'checkmark' : FLOOR_ICONS[mode].sf,
    onSelect: () => onChange(mode),
  }))
  return (
    <View accessible accessibilityRole="button" accessibilityLabel={t('room.menuFloor', { mode: t(`room.floor.${floor}`) })}>
      <NativeMenu items={items}>
        <View style={styles.round}>
          <Icon name={FLOOR_ICONS[floor].icon} size={17} color={colors.text} />
        </View>
      </NativeMenu>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 40,
      paddingLeft: 14,
      paddingRight: 8,
      flexShrink: 1,
    },
    buttonOn: { backgroundColor: 'transparent' },
    pressed: { opacity: 0.6 },
    label: { flexShrink: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  })
