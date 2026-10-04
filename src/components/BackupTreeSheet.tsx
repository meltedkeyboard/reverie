import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Avatar } from '@/components/Avatar'
import { GlassSurface } from '@/components/Glass'
import { PageSheet } from '@/components/PageSheet'
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated'

import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import {
  chatsSelected,
  isEmpty,
  nodeState,
  selectAll,
  selectNone,
  toggleChat,
  toggleNode,
  type BackupTree,
  type Branch,
  type CheckState,
  type Selection,
  type TreeNode,
} from '@/lib/backupSelection'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

type Props = {
  // The sheet is open while there is a tree.
  tree: BackupTree | null
  confirmLabel: string
  onConfirm: (selection: Selection) => void
  onClose: () => void
}

// The icon pops in and the old one shrinks away whenever the state changes.
function CheckMark({ state }: { state: CheckState }) {
  const colors = useColors()
  const name = state === 'all' ? 'checkmark-circle' : state === 'some' ? 'remove-circle' : 'ellipse-outline'
  return (
    <View style={{ width: 24, height: 24 }}>
      <Animated.View
        key={name}
        entering={ZoomIn.duration(160)}
        exiting={ZoomOut.duration(120)}
        style={{ position: 'absolute' }}
      >
        <Ionicons name={name} size={24} color={state === 'none' ? colors.textFaint : colors.accent} />
      </Animated.View>
    </View>
  )
}

// The trunk runs under the middle of the picture: 4 of padding plus half the 48 pt ring.
const TRUNK_X = 27
const LINE = 2
// The vertical padding of the picture's tap area, which the line crosses to meet the ring.
const STEM = 12
// From the trunk to the circle of the check mark. The icon box starts at 52 pt, but the circle
// of an Ionicons glyph is inset by 48 of 512 units of the 24 pt box (2.25 pt), so the branch
// reaches that far into the box.
const ICON_INSET = (48 / 512) * 24
const ELBOW = 25 + ICON_INSET

const SPRING = { damping: 28, stiffness: 320, mass: 0.8 }

// The ticked state as an outline around the picture: solid for everything, dashed for some of
// the chats, none (and the picture dimmed) for nothing. The outline grows out of the picture
// with a spring, the dashed and the solid one cross-fade, and the picture lights up.
function Ring({ state, children }: { state: CheckState; children: React.ReactNode }) {
  const colors = useColors()
  const solid = useSharedValue(state === 'all' ? 1 : 0)
  const dashed = useSharedValue(state === 'some' ? 1 : 0)
  const lit = useSharedValue(state === 'none' ? 0 : 1)
  const press = useSharedValue(1)

  useEffect(() => {
    solid.value = withSpring(state === 'all' ? 1 : 0, SPRING)
    dashed.value = withSpring(state === 'some' ? 1 : 0, SPRING)
    lit.value = withTiming(state === 'none' ? 0 : 1, { duration: 200 })
    // A small pop of the whole picture when the state changes.
    press.value = 0.96
    press.value = withSpring(1, SPRING)
  }, [state, solid, dashed, lit, press])

  const ringStyle = (value: typeof solid) =>
    useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, value.value)), transform: [{ scale: 1.15 - 0.15 * Math.min(1, Math.max(0, value.value)) }] }))
  const solidStyle = ringStyle(solid)
  const dashedStyle = ringStyle(dashed)
  const pictureStyle = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * lit.value, transform: [{ scale: press.value }] }))

  const ring = { position: 'absolute' as const, width: 48, height: 48, borderRadius: 24, borderWidth: 2.5, borderColor: colors.accent }
  return (
    <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[ring, solidStyle]} />
      <Animated.View style={[ring, { borderStyle: 'dashed' }, dashedStyle]} />
      <Animated.View style={pictureStyle}>{children}</Animated.View>
    </View>
  )
}

function Chevron({ open }: { open: boolean }) {
  const colors = useColors()
  const turn = useSharedValue(open ? 1 : 0)
  useEffect(() => {
    turn.value = withSpring(open ? 1 : 0, SPRING)
  }, [open, turn])
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }))
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={16} color={colors.textFaint} />
    </Animated.View>
  )
}

// A tree of characters with their chats and rooms with their scenes to tick what a backup
// takes (export) or brings in (import). Everything is ticked to begin with.
export function BackupTreeSheet({ tree, confirmLabel, onConfirm, onClose }: Props) {
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  const colors = useColors()
  const [selection, setSelection] = useState<Selection>(selectNone)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!tree) return
    setSelection(selectAll(tree))
    setOpen(new Set())
  }, [tree])

  const everything = tree ? selectAll(tree) : selectNone()
  const allOn =
    selection.characters.size === everything.characters.size &&
    selection.rooms.size === everything.rooms.size &&
    selection.chats.size === everything.chats.size

  const toggleOpen = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const section = (branch: Branch, title: string, nodes: TreeNode[]) =>
    nodes.length ? (
      <View key={branch}>
        <Animated.Text layout={LinearTransition.duration(200)} style={styles.section}>
          {title}
        </Animated.Text>
        {nodes.map((node) => {
          const key = `${branch}:${node.id}`
          const expanded = open.has(key)
          return (
            <Animated.View key={key} layout={LinearTransition.duration(200)}>
              <View style={styles.nodeRow}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync()
                    setSelection((s) => toggleNode(s, branch, node))
                  }}
                  style={styles.ringHit}
                  accessibilityRole="checkbox"
                  accessibilityLabel={node.name}
                >
                  <Ring state={nodeState(selection, branch, node)}>
                    {branch === 'characters' ? (
                      <Avatar name={node.name} file={node.avatar} uri={node.avatarUri} size={40} viewable={false} />
                    ) : (
                      <View style={styles.roomIcon}>
                        <Ionicons name="people" size={20} color={colors.accent} />
                      </View>
                    )}
                  </Ring>
                </Pressable>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => (node.chats.length ? toggleOpen(key) : setSelection((s) => toggleNode(s, branch, node)))}
                >
                  <Text style={styles.name} numberOfLines={1}>
                    {node.name}
                  </Text>
                  {node.chats.length ? (
                    <Text style={styles.count}>
                      {t('backup.selected', { selected: chatsSelected(selection, node), total: node.chats.length })}
                    </Text>
                  ) : null}
                  {node.chats.length ? (
                    <Chevron open={expanded} />
                  ) : null}
                </Pressable>
              </View>
              {expanded
                ? node.chats.map((chat, index) => (
                    <Animated.View key={chat.id} entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(120)}>
                      {/* The trunk runs on past each chat and a rounded branch peels off into it. The pieces are
                          solid and the group is faded as a whole, so where they overlap there is no darker spot. */}
                      <View pointerEvents="none" needsOffscreenAlphaCompositing style={styles.branch}>
                        {index === 0 ? <View style={styles.stem} /> : null}
                        {/* The last one stops at the elbow, but still joins the trunk of the row above. */}
                        <View style={index === node.chats.length - 1 ? [styles.trunk, styles.trunkEnd] : styles.trunk} />
                        <View style={styles.elbow} />
                      </View>
                    <Pressable
                      style={[styles.row, styles.child]}
                      onPress={() => {
                        Haptics.selectionAsync()
                        setSelection((s) => toggleChat(s, branch, node, chat.id))
                      }}
                    >
                      <CheckMark state={selection.chats.has(chat.id) ? 'all' : 'none'} />
                      <Text style={styles.chatTitle} numberOfLines={1}>
                        {chat.title || t('backup.untitled')}
                      </Text>
                      <Text style={styles.count}>{chat.messageCount}</Text>
                    </Pressable>
                    </Animated.View>
                  ))
                : null}
            </Animated.View>
          )
        })}
      </View>
    ) : null

  return (
    <PageSheet
      visible={tree !== null}
      onClose={onClose}
      title={t('backup.chooseTitle')}
      background={colors.bg}
      left={
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.action}>{t('backup.cancel')}</Text>
        </Pressable>
      }
      right={
        <Pressable onPress={() => onConfirm(selection)} disabled={isEmpty(selection)} hitSlop={8} style={isEmpty(selection) && { opacity: 0.4 }}>
          <GlassSurface interactive={!isEmpty(selection)} tintColor={colors.accent} style={styles.confirm} fallbackStyle={{ backgroundColor: colors.accent }}>
            <Text style={styles.confirmLabel}>{confirmLabel}</Text>
          </GlassSurface>
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={styles.list}>
        {tree ? (
          <>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync()
                setSelection(allOn ? selectNone() : everything)
              }}
              hitSlop={8}
              style={{ height: 24 }}
            >
              <Animated.Text
                key={allOn ? 'clear' : 'select'}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(120)}
                style={[styles.action, { position: 'absolute' }]}
              >
                {allOn ? t('backup.clearAll') : t('backup.selectAll')}
              </Animated.Text>
            </Pressable>
            {section('characters', t('backup.characters'), tree.characters)}
            {section('rooms', t('backup.rooms'), tree.rooms)}
            {tree.rooms.length ? (
              <Animated.Text layout={LinearTransition.duration(200)} style={styles.note}>
                {t('backup.roomNote')}
              </Animated.Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </PageSheet>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    list: { padding: 20, gap: 4 },
    section: { color: colors.textFaint, fontSize: 13, fontWeight: '600', marginTop: 18, marginBottom: 6, textTransform: 'uppercase' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    // The two taps fill the whole row: the picture side ticks, the rest opens.
    nodeRow: { flexDirection: 'row', alignItems: 'stretch' },
    ringHit: { justifyContent: 'center', paddingVertical: 12, paddingLeft: 4, paddingRight: 14 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    child: { paddingLeft: 52 },
    // From the foot of the picture down to the first chat, then a rounded elbow into every chat
    // and the trunk on to the next one.
    branch: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.22 },
    stem: { position: 'absolute', left: TRUNK_X, top: -STEM, height: STEM, width: LINE, backgroundColor: colors.text },
    elbow: {
      position: 'absolute',
      left: TRUNK_X,
      top: 0,
      height: '50%',
      width: ELBOW,
      borderLeftWidth: LINE,
      borderBottomWidth: LINE,
      borderBottomLeftRadius: 12,
      borderColor: colors.text,
      transform: [{ translateY: LINE / 2 }],
    },
    trunk: { position: 'absolute', left: TRUNK_X, top: 0, bottom: 0, width: LINE, backgroundColor: colors.text },
    // Only a stub that joins the row above: past it the elbow's rounded corner takes over.
    trunkEnd: { bottom: undefined, height: LINE * 2 },
    name: { flex: 1, color: colors.text, fontSize: 16 },
    chatTitle: { flex: 1, color: colors.text, fontSize: 15 },
    count: { color: colors.textFaint, fontSize: 13 },
    action: { color: colors.accent, fontSize: 17 },
    confirm: { minHeight: 36, paddingHorizontal: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    confirmLabel: { color: ON_ACCENT, fontSize: 16, fontWeight: '600' },
    roomIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    note: { color: colors.textFaint, fontSize: 13, marginTop: 16 },
  })
