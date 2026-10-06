import { Icon } from '@/components/visuals/Icon'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { isDesktop } from '@/lib/core/platform'
import { isKey, useWindowKey } from '@/hooks/util/useWindowKey'
import { usePromptState } from '@/hooks/chat/usePromptState'
import { useTranslation } from '@/i18n'
import { closeDialog, getDialog, subscribeDialog, type AppDialog } from '@/lib/ui/dialogStore'
import { type Colors, FILL, ON_ACCENT, useColors, useStyles } from '@/theme'

type Sheet = Extract<AppDialog, { kind: 'sheet' }>
type Confirm = Extract<AppDialog, { kind: 'confirm' }>
type Prompt = Extract<AppDialog, { kind: 'prompt' }>['prompt']

const EDGE = 8

// The same pop as the composer's attach menu: a spring in, a quick ease out.
const popIn = (pop: SharedValue<number>) => {
  pop.value = withSpring(1, { damping: 20, stiffness: 300, mass: 0.7 })
}

// The dialogs of a desktop window: a menu opens at the click like a context menu, a
// question or a text field is a small window in the middle. Neither is a sheet from the
// bottom, which is a phone's way. Esc closes any of them.
export function WebDialogHost() {
  const live = useSyncExternalStore(subscribeDialog, getDialog)
  const styles = useStyles(createStyles)
  // The last dialog stays on screen while it plays its exit.
  const [dialog, setDialog] = useState(live)
  const pop = useSharedValue(0)
  const shownRef = useRef<AppDialog | null>(null)

  useEffect(() => {
    if (live) {
      // A different dialog replacing one that is leaving starts from nothing again.
      if (shownRef.current !== live) pop.value = 0
      shownRef.current = live
      setDialog(live)
      popIn(pop)
    } else {
      shownRef.current = null
      pop.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(setDialog, null)
      })
    }
  }, [live, pop])

  const dimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value) }))

  useWindowKey(isKey('Escape'), closeDialog, !!live)

  if (!dialog) return null
  const menu = dialog.kind === 'sheet'
  return (
    <View style={styles.layer} pointerEvents={live ? 'auto' : 'none'}>
      <Pressable style={StyleSheet.absoluteFill} onPress={closeDialog} />
      {menu ? null : <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />}
      {dialog.kind === 'sheet' ? <Menu key={dialog.title} dialog={dialog} pop={pop} /> : null}
      {dialog.kind === 'confirm' ? <Question dialog={dialog} pop={pop} /> : null}
      {dialog.kind === 'prompt' ? <TextWindow key={dialog.prompt.title} {...dialog.prompt} pop={pop} /> : null}
    </View>
  )
}

function Menu({ dialog, pop }: { dialog: Sheet; pop: SharedValue<number> }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const win = useWindowDimensions()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((old) => (old?.width === width && old.height === height ? old : { width, height }))
  }

  // Below and to the right of the click; against an edge it opens the other way instead.
  const { anchor } = dialog
  let position: { left: number; top: number }
  if (!size) position = { left: anchor?.x ?? 0, top: anchor?.y ?? 0 }
  else if (!anchor) position = { left: (win.width - size.width) / 2, top: (win.height - size.height) / 2 }
  else {
    const left = anchor.x + size.width + EDGE > win.width ? anchor.x - size.width : anchor.x
    const top = anchor.y + size.height + EDGE > win.height ? anchor.y - size.height : anchor.y
    position = { left: Math.max(EDGE, left), top: Math.max(EDGE, top) }
  }

  // It grows out of the corner that sits at the click, whichever way it was flipped.
  const origin = !size || !anchor ? 'center' : `${position.left === anchor.x ? 'left' : 'right'} ${position.top === anchor.y ? 'top' : 'bottom'}`
  const shown = !!size
  const popStyle = useAnimatedStyle(() => ({
    opacity: shown ? Math.min(1, pop.value * 2) : 0,
    transform: [{ scale: pop.value }],
  }))

  // mouseenter and mouseleave exist on the web only, so they go in by spread, past the native types.
  const hoverOf = (index: number) => ({ onMouseEnter: () => setHovered(index), onMouseLeave: () => setHovered(null) })

  return (
    <Animated.View style={[styles.menu, position, { transformOrigin: origin }, popStyle]} onLayout={onLayout}>
      {dialog.title ? (
        <Text style={styles.menuTitle} numberOfLines={1}>
          {dialog.title}
        </Text>
      ) : null}
      {dialog.actions.map((action, index) => (
        <View key={index} {...hoverOf(index)}>
          <Pressable
            style={[styles.menuRow, hovered === index && { backgroundColor: colors.surfaceRaised }]}
            onPress={() => {
              closeDialog()
              action.onSelect()
            }}
          >
            <Text style={[styles.menuLabel, action.destructive && { color: colors.danger }]}>{action.label}</Text>
          </Pressable>
        </View>
      ))}
    </Animated.View>
  )
}

// A window in the middle swells a little from its center.
function useWindowPop(pop: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.5),
    transform: [{ scale: 0.92 + 0.08 * pop.value }],
  }))
}

function Question({ dialog, pop }: { dialog: Confirm; pop: SharedValue<number> }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const popStyle = useWindowPop(pop)
  const accept = () => {
    // The window lingers for its exit; Enter must not confirm it a second time.
    if (getDialog() !== dialog) return
    closeDialog()
    dialog.onConfirm()
  }
  useWindowKey(isKey('Enter'), accept)
  return (
    <Animated.View style={[styles.window, popStyle]}>
      <Text style={styles.windowTitle}>{dialog.title}</Text>
      {dialog.message ? <Text style={styles.windowMessage}>{dialog.message}</Text> : null}
      <View style={styles.buttons}>
        {dialog.cancelable ? (
          <Pressable style={[styles.button, styles.buttonPlain]} onPress={closeDialog}>
            <Text style={[styles.buttonLabel, { color: colors.textMuted }]}>{t('common.cancel')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.button, { backgroundColor: dialog.destructive ? colors.danger : colors.accent }]}
          onPress={accept}
        >
          <Text style={[styles.buttonLabel, { color: ON_ACCENT }]}>{dialog.confirmLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

function TextWindow({ title, message, initial, confirmLabel, onSubmit, pop }: Prompt & { pop: SharedValue<number> }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const { text, setText, submit } = usePromptState(initial, onSubmit)
  const popStyle = useWindowPop(pop)
  return (
    <Animated.View style={[styles.window, popStyle]}>
      <Text style={styles.windowTitle}>{title}</Text>
      {message ? <Text style={styles.windowMessage}>{message}</Text> : null}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        autoFocus
        selectTextOnFocus
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
      />
      <View style={styles.buttons}>
        <Pressable style={[styles.button, styles.buttonPlain]} onPress={closeDialog}>
          <Text style={[styles.buttonLabel, { color: colors.textMuted }]}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={submit}>
          <Text style={[styles.buttonLabel, { color: ON_ACCENT }]}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    layer: { ...FILL, zIndex: 1000, alignItems: 'center', justifyContent: 'center' },
    dim: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
    menu: {
      position: 'absolute',
      minWidth: 200,
      maxWidth: 320,
      padding: 6,
      borderRadius: 14,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      boxShadow: '0 8px 28px rgba(0, 0, 0, 0.35)',
    },
    menuTitle: { color: colors.textFaint, fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
    menuRow: { paddingHorizontal: 10, paddingVertical: isDesktop ? 6 : 8, borderRadius: isDesktop ? 5 : 8 },
    menuLabel: { color: colors.text, fontSize: 14 },
    window: {
      width: '100%',
      maxWidth: 420,
      padding: 20,
      gap: 12,
      borderRadius: 16,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
    },
    windowTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
    windowMessage: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
    input: {
      color: colors.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
    button: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: isDesktop ? 6 : 10, borderCurve: 'continuous' },
    buttonPlain: isDesktop ? { backgroundColor: colors.surfaceRaised } : { borderWidth: 1, borderColor: colors.borderStrong },
    buttonLabel: { fontSize: 14, fontWeight: '600' },
  })
