import Ionicons from '@expo/vector-icons/Ionicons'
import { Fragment, useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type CSSTransitionProperties,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import type { RoomMember } from '@/db/rooms'
import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { useColors, useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { BottomSheet, useSheetTones } from './BottomSheet'
import { Check } from './Check'
import { StarToggle } from './motifs/StarToggle'

type Props = {
  visible: boolean
  onClose: () => void
  members: RoomMember[]
  addressees: number[]
  narration: boolean
  // Picking someone or the whole room turns the narrator off, see RoomView.
  onChangeAddressees: (ids: number[]) => void
  onNarrate: () => void
  whisper: boolean
  onToggleWhisper: () => void
  speakingId: number | null
  queuedIds: number[]
  // Walking in and out is told by the narrator, so it waits until nobody is replying.
  canMove: boolean
  onTogglePresent: (member: RoomMember) => void
  onMemberMenu: (member: RoomMember) => void
}

const AVATAR = 40
const ROW_PADDING = 16
const GAP = 12
// Dimming of someone out of the scene, or of a switch that can't be used now.
const AWAY = 0.45
const FADE: CSSTransitionProperties = { transitionProperty: 'opacity', transitionDuration: 180 }
const DOT: CSSTransitionProperties = { transitionProperty: ['width', 'marginRight', 'opacity'], transitionDuration: 200 }

// Who the next message is for, in a sheet: the whole room, the narrator's voice, or
// someone of the cast. A tap on someone writes to them alone, a swipe to the left
// walks them out of the scene or back in, and a long press has the rest.
export function CastSheet({
  visible,
  onClose,
  members,
  addressees,
  narration,
  onChangeAddressees,
  onNarrate,
  whisper,
  onToggleWhisper,
  speakingId,
  queuedIds,
  canMove,
  onTogglePresent,
  onMemberMenu,
}: Props) {
  const colors = useColors()
  const tones = useSheetTones()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  // While narrating nobody is spoken to, whatever was picked before.
  const picked = narration ? [] : addressees
  // The narrator is heard by everyone. Otherwise the whisper can be switched on before
  // anyone is picked.
  const canWhisper = !narration
  const whisperNames = members
    .filter((m) => picked.includes(m.characterId))
    .map((m) => m.character.name)
    .join(', ')
  const whisperHints = [
    t('room.castWhisperNarration'),
    t('room.castWhisperOff'),
    t('room.castWhisperHint', { names: whisperNames }),
    t('room.castWhisperPick'),
  ]
  const whisperHint = narration ? 0 : !whisper ? 1 : picked.length ? 2 : 3
  const statuses = [
    t('room.castSpeaking'),
    t('room.castQueued'),
    t('room.castAway'),
    t('room.castMuted'),
    t('room.castPresent'),
  ]

  const pickOnly = (ids: number[]) => {
    Haptics.selectionAsync()
    onChangeAddressees(ids)
  }

  const statusOf = (member: RoomMember) => {
    if (member.characterId === speakingId) return 0
    if (queuedIds.includes(member.characterId)) return 1
    if (!member.present) return 2
    if (member.muted) return 3
    return 4
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('room.castTitle')}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={[styles.card, { backgroundColor: tones.card }]}>
          <ModeRow
            icon="people"
            title={t('room.everyone')}
            hint={t('room.castEveryoneHint')}
            on={!picked.length && !narration}
            onPress={() => pickOnly([])}
          />
          <View style={[styles.separator, { marginLeft: ROW_PADDING + AVATAR + GAP }]} />
          <ModeRow
            icon="book"
            title={t('room.narration')}
            hint={t('room.castNarrationHint')}
            on={narration}
            onPress={() => {
              Haptics.selectionAsync()
              onNarrate()
            }}
          />

          {members.map((member) => {
            const id = member.characterId
            const speaking = id === speakingId
            const live = speaking || queuedIds.includes(id)
            return (
              <Fragment key={id}>
                <View style={[styles.separator, { marginLeft: ROW_PADDING + AVATAR + GAP }]} />
                <SwipeRow
                  enabled={canMove}
                  present={member.present}
                  onToggle={() => onTogglePresent(member)}
                  onPress={() => pickOnly([id])}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    onMemberMenu(member)
                  }}
                  name={member.character.name}
                >
                  <Animated.View style={[{ opacity: member.present ? 1 : AWAY }, FADE]}>
                    <Speaking active={speaking} color={colors.cast[member.position % colors.cast.length]}>
                      <Avatar name={member.character.name} file={member.character.avatar} size={AVATAR} viewable={false} />
                    </Speaking>
                  </Animated.View>
                  <Animated.View style={[styles.body, { opacity: member.present ? 1 : AWAY }, FADE]}>
                    <Text style={styles.name} numberOfLines={1}>
                      {member.character.name}
                    </Text>
                    <View style={styles.statusRow}>
                      <Animated.View
                        style={[
                          styles.liveDot,
                          { backgroundColor: colors.cast[member.position % colors.cast.length] },
                          live ? styles.liveDotOn : styles.liveDotOff,
                          DOT,
                        ]}
                      />
                      <View style={styles.statusText}>
                        <CrossFade texts={statuses} index={statusOf(member)} style={styles.status} numberOfLines={1} />
                      </View>
                    </View>
                  </Animated.View>
                  <Check on={picked.includes(id)} />
                </SwipeRow>
              </Fragment>
            )
          })}
        </View>
        <CrossFade texts={[t('room.castHint'), t('room.castBusy')]} index={canMove ? 0 : 1} style={styles.hint} />

        <View style={[styles.card, styles.secondCard, { backgroundColor: tones.card }]}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync()
              onToggleWhisper()
            }}
            disabled={!canWhisper}
            accessibilityRole="switch"
            accessibilityState={{ checked: whisper && canWhisper, disabled: !canWhisper }}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tones.pressed : tones.row }]}
          >
            <Animated.View style={[styles.modeIcon, { opacity: canWhisper ? 1 : AWAY }, FADE]}>
              <Ionicons name="lock-closed" size={18} color={colors.accent} />
            </Animated.View>
            <View style={styles.body}>
              <Animated.Text style={[styles.name, { opacity: canWhisper ? 1 : AWAY }, FADE]}>{t('room.whisper')}</Animated.Text>
              <CrossFade texts={whisperHints} index={whisperHint} style={styles.status} />
            </View>
            <Animated.View style={[{ opacity: canWhisper ? 1 : AWAY }, FADE]} pointerEvents={canWhisper ? 'auto' : 'none'}>
              <StarToggle value={whisper && canWhisper} onValueChange={onToggleWhisper} />
            </Animated.View>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  )
}

type ModeRowProps = {
  icon: 'people' | 'book'
  title: string
  hint: string
  on: boolean
  onPress: () => void
}

// A row that is not a character: the whole room, or the narrator's voice.
function ModeRow({ icon, title, hint, on, onPress }: ModeRowProps) {
  const colors = useColors()
  const tones = useSheetTones()
  const styles = useStyles(createStyles)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tones.pressed : tones.row }]}
    >
      <View style={styles.modeIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{title}</Text>
        <Text style={styles.status}>{hint}</Text>
      </View>
      <Check on={on} />
    </Pressable>
  )
}

// Always in its place, so the row's text keeps its width; it only fades and grows in.
// Every wording a line can take, stacked in one place: the line keeps the height of the
// longest one, so nothing below it jumps when it changes, and the change is a crossfade.
function CrossFade({
  texts,
  index,
  style,
  numberOfLines,
}: {
  texts: string[]
  index: number
  style: StyleProp<TextStyle>
  numberOfLines?: number
}) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.stack}>
      {texts.map((text, i) => (
        <Animated.Text
          key={i}
          style={[style, styles.stackItem, i > 0 && styles.stackOver, { opacity: i === index ? 1 : 0 }, FADE]}
          numberOfLines={numberOfLines}
          accessibilityElementsHidden={i !== index}
          importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
        >
          {text}
        </Animated.Text>
      ))}
    </View>
  )
}

type SwipeRowProps = {
  enabled: boolean
  present: boolean
  onToggle: () => void
  onPress: () => void
  onLongPress: () => void
  name: string
  children: React.ReactNode
}

// Past this pull letting go walks the character in or out.
const TRIGGER = 88
const SPRING = { damping: 24, stiffness: 240 }

// A member's row. A swipe to the left uncovers what it will do and does it on release,
// then the row springs back; there is nothing to confirm, the way back is the same swipe.
function SwipeRow({ enabled, present, onToggle, onPress, onLongPress, name, children }: SwipeRowProps) {
  const colors = useColors()
  const tones = useSheetTones()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const offset = useSharedValue(0)
  const armed = useSharedValue(false)
  const action = present ? t('room.castLeave') : t('room.castEnter')

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      // Nothing is behind the left edge, so a pull to the right only gives a little.
      offset.value = e.translationX > 0 ? e.translationX * 0.15 : e.translationX
      const past = -offset.value > TRIGGER
      if (past !== armed.value) {
        armed.value = past
        scheduleOnRN(tick)
      }
    })
    .onEnd(() => {
      const fire = armed.value
      armed.value = false
      // The change waits for the row to settle, so the color behind it does not flip
      // to the opposite action while it is still in view.
      offset.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished && fire) scheduleOnRN(onToggle)
      })
    })

  // Someone out of the scene can't be written to; the tap hints at the swipe instead.
  const peek = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    offset.value = withSequence(withTiming(-40, { duration: 150 }), withSpring(0, SPRING))
  }

  const content = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))
  // Only as wide as the gap the row leaves: on glass the row is see-through, and the
  // color under it would show.
  const behind = useAnimatedStyle(() => ({
    width: Math.max(0, -offset.value),
    opacity: interpolate(-offset.value, [0, 28], [0, 1], 'clamp'),
  }))
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(armed.value ? 1.2 : 1, { duration: 120 }) }] }))

  return (
    <View>
      <Animated.View style={[styles.behind, { backgroundColor: present ? colors.danger : colors.success }, behind]}>
        <Animated.View style={[styles.behindLabel, icon]}>
          <Ionicons name={present ? 'exit-outline' : 'enter-outline'} size={20} color="#FFFFFF" />
          <Text style={styles.behindText}>{action}</Text>
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={content}>
          <Pressable
            onPress={present ? onPress : peek}
            onLongPress={onLongPress}
            delayLongPress={350}
            accessibilityLabel={name}
            accessibilityActions={enabled ? [{ name: 'toggle', label: action }] : undefined}
            onAccessibilityAction={() => onToggle()}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tones.pressed : tones.row }]}
          >
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

// A ring in the character's color that breathes while they are speaking.
function Speaking({ active, color, children }: { active: boolean; color: string; children: React.ReactNode }) {
  const level = useSharedValue(0)
  useEffect(() => {
    if (active) level.value = withRepeat(withTiming(1, { duration: 650 }), -1, true)
    else {
      cancelAnimation(level)
      level.value = withTiming(0, { duration: 150 })
    }
  }, [active, level])
  const ring = useAnimatedStyle(() => ({ opacity: level.value, transform: [{ scale: 1 + level.value * 0.1 }] }))
  return (
    <View>
      <Animated.View pointerEvents="none" style={[ringStyle.ring, { borderColor: color }, ring]} />
      {children}
    </View>
  )
}

const ringStyle = StyleSheet.create({
  ring: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 30, borderWidth: 2 },
})

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 4 },
    card: { borderRadius: 26, overflow: 'hidden' },
    secondCard: { marginTop: 20 },
    row: { flexDirection: 'row', alignItems: 'center', gap: GAP, paddingHorizontal: ROW_PADDING, paddingVertical: 13 },
    separator: { height: StyleSheet.hairlineWidth, marginRight: ROW_PADDING, backgroundColor: colors.borderStrong },
    modeIcon: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: AVATAR / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
    },
    body: { flex: 1 },
    name: { color: colors.text, fontSize: 17 },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    liveDot: { height: 6, borderRadius: 3 },
    liveDotOn: { width: 6, marginRight: 6, opacity: 1 },
    liveDotOff: { width: 0, marginRight: 0, opacity: 0 },
    // Yoga has no grid: side by side at full width, each pulled back over the first,
    // the lines share one spot and the box takes the tallest.
    // The stack's lines are as wide as it is, so it needs a width of its own: stretched
    // in a column, or given the rest of a row.
    stack: { flexDirection: 'row', alignSelf: 'stretch' },
    statusText: { flex: 1 },
    stackItem: { width: '100%', flexShrink: 0 },
    stackOver: { marginLeft: '-100%' },
    status: { color: colors.textMuted, fontSize: 15, flexShrink: 1 },
    behind: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingRight: 22,
    },
    behindLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    behindText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    hint: { color: colors.textMuted, fontSize: 14, lineHeight: 19, paddingHorizontal: 16, paddingTop: 12 },
  })
