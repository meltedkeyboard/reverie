import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Icon } from '@/components/visuals/Icon'
import { WebDialogHost } from '@/components/overlays/WebDialogs'
import { usePromptState } from '@/hooks/chat/usePromptState'
import { useTranslation } from '@/i18n'
import { closeDialog, getDialog, subscribeDialog, type AppDialog } from '@/lib/ui/dialogStore'
import type { SheetAction, TextPrompt } from '@/lib/ui/dialogs'
import { isWeb } from '@/lib/core/platform'
import { ON_ACCENT, SchemeOverride, useStyles, useTheme, type Colors } from '@/theme'

export function DialogHost() {
  return isWeb ? <WebDialogHost /> : <SheetDialogHost />
}

function iconForSymbol(symbol?: string): React.ComponentProps<typeof Icon>['name'] | undefined {
  if (!symbol) return undefined
  switch (symbol) {
    case 'person.crop.circle':
      return 'person-circle-outline'
    case 'pencil':
      return 'pencil-outline'
    case 'sparkles':
      return 'sparkles-outline'
    case 'trash':
      return 'trash-outline'
    case 'plus.square.on.square':
    case 'doc.on.doc':
      return 'copy-outline'
    case 'square.and.arrow.up':
      return 'share-outline'
    case 'square.and.arrow.down':
      return 'download-outline'
    case 'archivebox':
      return 'archive-outline'
    case 'tray.and.arrow.up':
      return 'arrow-up-circle-outline'
    case 'eye':
      return 'eye-outline'
    case 'eye.slash':
      return 'eye-off-outline'
    case 'person.3':
    case 'person.2.circle':
      return 'people-outline'
    case 'person.badge.plus':
      return 'person-add-outline'
    case 'person.wave.2':
      return 'hand-right-outline'
    case 'plus':
      return 'add-outline'
    case 'plus.bubble':
      return 'chatbubble-ellipses-outline'
    case 'bubble.left.and.bubble.right':
      return 'chatbubbles-outline'
    case 'text.bubble':
      return 'chatbubble-outline'
    case 'camera':
      return 'camera-outline'
    case 'photo':
      return 'image-outline'
    case 'photo.on.rectangle':
      return 'images-outline'
    case 'folder':
      return 'folder-outline'
    case 'lock':
      return 'lock-closed-outline'
    case 'info.circle':
      return 'information-circle-outline'
    case 'arrow.clockwise':
      return 'refresh-outline'
    case 'arrow.counterclockwise':
      return 'arrow-undo-outline'
    case 'arrow.triangle.branch':
      return 'git-branch-outline'
    case 'rectangle.portrait.and.arrow.right':
      return 'exit-outline'
    case 'rectangle.stack.badge.minus':
      return 'albums-outline'
    case 'minus.circle':
      return 'remove-circle-outline'
    case 'signpost.right':
      return 'navigate-outline'
    case 'figure.walk':
      return 'walk-outline'
    case 'checkmark.circle':
    case 'checkmark':
      return 'checkmark-circle-outline'
    case 'xmark':
      return 'close-outline'
    case 'brain':
      return 'hardware-chip-outline'
    default:
      return undefined
  }
}

function SheetDialogHost() {
  const dialog = useSyncExternalStore(subscribeDialog, getDialog)
  if (!dialog) return null

  const scheme = dialog.kind === 'prompt' ? dialog.scheme : dialog.scheme

  return (
    <SchemeOverride scheme={scheme ?? null}>
      <DialogModal key={dialogKey(dialog)} dialog={dialog} />
    </SchemeOverride>
  )
}

function dialogKey(dialog: AppDialog): string {
  switch (dialog.kind) {
    case 'sheet':
      return dialog.title ?? 'sheet'
    case 'confirm':
      return dialog.title
    case 'prompt':
      return dialog.prompt.title
  }
}

function DialogModal({ dialog }: { dialog: AppDialog }) {
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const isSheet = dialog.kind === 'sheet'
  const isPrompt = dialog.kind === 'prompt'

  const presented = useRef(false)
  const measured = useRef(false)
  const closing = useRef(false)

  // Start offscreen for sheets; start at scale 0.92 for modals.
  const offset = useSharedValue(900)
  const travel = useSharedValue(900)
  const dim = useSharedValue(0)
  const scale = useSharedValue(0.92)
  const grab = useSharedValue(0)

  const callbackRef = useRef<(() => void) | undefined>(undefined)

  const finishDismiss = () => {
    closeDialog()
    const cb = callbackRef.current
    callbackRef.current = undefined
    cb?.()
  }

  const dismiss = (callback?: () => void) => {
    if (closing.current) return
    closing.current = true
    callbackRef.current = callback
    if (isSheet) {
      dim.value = withTiming(0, { duration: 140 })
      offset.value = withTiming(travel.value, { duration: 160, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(finishDismiss)
      })
    } else {
      dim.value = withTiming(0, { duration: 140 })
      scale.value = withTiming(0.92, { duration: 140 }, (finished) => {
        if (finished) scheduleOnRN(finishDismiss)
      })
    }
  }

  const panDismiss = () => {
    dismiss(() => {
      if (dialog.kind === 'sheet') dialog.onCancel?.()
    })
  }

  const pan = Gesture.Pan()
    .enabled(isSheet)
    .activeOffsetY([0, 6])
    .onBegin(() => {
      grab.value = offset.value
    })
    .onUpdate((e) => {
      if (closing.current) return
      const y = grab.value + e.translationY
      offset.value = y >= 0 ? y : y * 0.15
      if (travel.value > 0) {
        dim.value = Math.max(0, 1 - Math.max(0, offset.value) / travel.value)
      }
    })
    .onEnd((e) => {
      if (closing.current) return
      if (offset.value > 70 || e.velocityY > 500) {
        scheduleOnRN(panDismiss)
      } else {
        offset.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) })
        dim.value = withTiming(1, { duration: 160 })
      }
    })

  const tryOpen = () => {
    if (closing.current) return
    if (isSheet) {
      if (!presented.current || !measured.current) return
      offset.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) })
      dim.value = withTiming(1, { duration: 180 })
    } else {
      if (!presented.current) return
      dim.value = withTiming(1, { duration: 180 })
      scale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) })
    }
  }

  // Safety trigger in case onShow is delayed by the native window
  useEffect(() => {
    const timer = setTimeout(() => {
      presented.current = true
      tryOpen()
    }, 60)
    return () => clearTimeout(timer)
  }, [])

  const onShow = () => {
    presented.current = true
    tryOpen()
  }

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height + Math.max(14, insets.bottom + 6) + 40
    travel.value = h
    if (!measured.current) {
      offset.value = h
      measured.current = true
    }
    tryOpen()
  }

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: dim.value,
  }))

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }))

  const modalAnimStyle = useAnimatedStyle(() => ({
    opacity: dim.value,
    transform: [{ scale: scale.value }],
  }))

  const handleBackdropPress = () => {
    dismiss(() => {
      if (dialog.kind === 'sheet' || dialog.kind === 'confirm') dialog.onCancel?.()
    })
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={onShow}
      onRequestClose={handleBackdropPress}
    >
      <GestureHandlerRootView style={styles.fill}>
        <View
          style={[
            styles.backdrop,
            isSheet && styles.backdropSheet,
            isPrompt && styles.backdropPrompt,
            !isSheet && !isPrompt && styles.backdropCentered,
          ]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdropDim, backdropAnimStyle]} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleBackdropPress}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />

          {dialog.kind === 'sheet' ? (
            <ActionSheet
              title={dialog.title}
              message={dialog.message}
              actions={dialog.actions}
              bottomInset={insets.bottom}
              animStyle={sheetAnimStyle}
              panGesture={pan}
              onLayout={onSheetLayout}
              onDismiss={dismiss}
            />
          ) : null}

          {dialog.kind === 'confirm' ? (
            <ConfirmDialog
              dialog={dialog}
              animStyle={modalAnimStyle}
              onDismiss={dismiss}
            />
          ) : null}

          {dialog.kind === 'prompt' ? (
            <PromptDialog
              prompt={dialog.prompt}
              animStyle={modalAnimStyle}
              onDismiss={dismiss}
            />
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

function ActionSheet({
  title,
  message,
  actions,
  bottomInset,
  animStyle,
  panGesture,
  onLayout,
  onDismiss,
}: {
  title?: string
  message?: string
  actions: (Pick<SheetAction, 'label' | 'destructive' | 'systemImage' | 'separated'> & { onSelect: () => void })[]
  bottomInset: number
  animStyle: any
  panGesture?: any
  onLayout: (e: LayoutChangeEvent) => void
  onDismiss: (callback?: () => void) => void
}) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const { t } = useTranslation()

  const items = actions.map((action, index) => {
    const iconName = iconForSymbol(action.systemImage)
    const isDestructive = Boolean(action.destructive)
    const isFirst = index === 0 && !title && !message
    const isLast = index === actions.length - 1

    return (
      <View key={index}>
        {action.separated && index > 0 ? <View style={styles.separator} /> : null}
        <Pressable
          android_ripple={{ color: colors.surfaceRaised, borderless: false }}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: colors.surfaceRaised },
            isFirst && styles.rowFirst,
            isLast && styles.rowLast,
          ]}
          onPress={() => {
            onDismiss(() => {
              action.onSelect()
            })
          }}
        >
          {iconName ? (
            <View style={styles.iconBox}>
              <Icon
                name={iconName}
                size={20}
                color={isDestructive ? colors.danger : colors.textMuted}
              />
            </View>
          ) : null}
          <Text
            style={[
              styles.label,
              isDestructive && { color: colors.danger, fontWeight: '500' },
            ]}
            numberOfLines={1}
          >
            {action.label}
          </Text>
        </Pressable>
        {!isLast && !action.separated ? (
          <View style={[styles.hairline, { marginLeft: iconName ? 54 : 18 }]} />
        ) : null}
      </View>
    )
  })

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.sheetSlot,
        { paddingBottom: Math.max(14, bottomInset + 6) },
        animStyle,
      ]}
    >
      <View style={styles.card}>
        <GestureDetector gesture={panGesture}>
          <Pressable
            style={styles.headerZone}
            onPress={() => onDismiss()}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <View style={styles.grabber} />
            {title ? (
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {title}
              </Text>
            ) : null}
            {message ? (
              <Text style={styles.sheetMessage}>
                {message}
              </Text>
            ) : null}
          </Pressable>
        </GestureDetector>

        {title || message ? <View style={styles.headerRule} /> : null}

        {actions.length > 7 ? (
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={styles.sheetScroll}
          >
            {items}
          </ScrollView>
        ) : (
          <View>{items}</View>
        )}

        <View style={styles.cancelDivider} />

        <Pressable
          android_ripple={{ color: colors.surfaceRaised, borderless: false }}
          style={({ pressed }) => [
            styles.cancelRow,
            pressed && { backgroundColor: colors.surfaceRaised },
          ]}
          onPress={() => onDismiss()}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Text style={styles.cancelLabel}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

function ConfirmDialog({
  dialog,
  animStyle,
  onDismiss,
}: {
  dialog: Extract<AppDialog, { kind: 'confirm' }>
  animStyle: any
  onDismiss: (callback?: () => void) => void
}) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const { t } = useTranslation()

  const accept = () => {
    onDismiss(() => dialog.onConfirm())
  }

  const cancel = () => {
    onDismiss(() => dialog.onCancel?.())
  }

  const isDestructive = Boolean(dialog.destructive)

  return (
    <Animated.View style={[styles.modalCard, animStyle]}>
      <View
        style={[
          styles.modalBadge,
          {
            backgroundColor: isDestructive
              ? colors.dangerSoft
              : dialog.cancelable
                ? colors.accentSoft
                : colors.surfaceRaised,
          },
        ]}
      >
        <Icon
          name={
            isDestructive
              ? 'trash-outline'
              : dialog.cancelable
                ? 'help-circle-outline'
                : 'information-circle-outline'
          }
          size={24}
          color={
            isDestructive
              ? colors.danger
              : dialog.cancelable
                ? colors.accent
                : colors.text
          }
        />
      </View>

      <Text style={styles.modalTitle}>{dialog.title}</Text>
      {dialog.message ? <Text style={styles.modalMessage}>{dialog.message}</Text> : null}

      <View style={styles.modalButtons}>
        {dialog.cancelable ? (
          <Pressable
            android_ripple={{ color: colors.surfaceRaised, borderless: false }}
            style={({ pressed }) => [
              styles.modalButton,
              styles.modalButtonSecondary,
              pressed && { opacity: 0.8 },
            ]}
            onPress={cancel}
          >
            <Text style={styles.modalSecondaryLabel}>
              {dialog.cancelLabel ?? t('common.cancel')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)', borderless: false }}
          style={({ pressed }) => [
            styles.modalButton,
            { backgroundColor: isDestructive ? colors.danger : colors.accent },
            pressed && { opacity: 0.88 },
          ]}
          onPress={accept}
        >
          <Text style={styles.modalPrimaryLabel}>{dialog.confirmLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

function PromptDialog({
  prompt,
  animStyle,
  onDismiss,
}: {
  prompt: TextPrompt
  animStyle: any
  onDismiss: (callback?: () => void) => void
}) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { text, setText, submit } = usePromptState(prompt.initial, prompt.onSubmit)

  const handleSubmit = () => {
    onDismiss(() => submit())
  }

  return (
    <Animated.View style={[styles.modalCard, animStyle]}>
      <Text style={styles.promptHeaderTitle}>{prompt.title}</Text>
      {prompt.message ? <Text style={styles.promptHeaderMessage}>{prompt.message}</Text> : null}

      <TextInput
        style={styles.promptInput}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
      />

      <View style={styles.modalButtons}>
        <Pressable
          android_ripple={{ color: colors.surfaceRaised, borderless: false }}
          style={({ pressed }) => [
            styles.modalButton,
            styles.modalButtonSecondary,
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => onDismiss()}
        >
          <Text style={styles.modalSecondaryLabel}>{t('common.cancel')}</Text>
        </Pressable>

        <Pressable
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)', borderless: false }}
          style={({ pressed }) => [
            styles.modalButton,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.88 },
          ]}
          onPress={handleSubmit}
        >
          <Text style={styles.modalPrimaryLabel}>{prompt.confirmLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    fill: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
    },
    backdropDim: {
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    backdropSheet: {
      justifyContent: 'flex-end',
    },
    backdropCentered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    // The prompt sits in the upper part so the keyboard never covers it.
    backdropPrompt: {
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingTop: 100,
    },
    sheetSlot: {
      width: '100%',
      maxWidth: 540,
      alignSelf: 'center',
      paddingHorizontal: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      overflow: 'hidden',
      elevation: 6,
    },
    headerZone: {
      width: '100%',
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 6,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      marginBottom: 6,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
      paddingHorizontal: 16,
      paddingTop: 2,
      paddingBottom: 2,
    },
    sheetMessage: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    headerRule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: 6,
    },
    sheetScroll: {
      maxHeight: 380,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      height: 52,
      gap: 14,
    },
    rowFirst: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    rowLast: {
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    iconBox: {
      width: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginRight: 18,
    },
    separator: {
      height: 6,
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    cancelDivider: {
      height: 6,
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    cancelRow: {
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      overflow: 'hidden',
    },
    cancelLabel: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    modalCard: {
      width: '88%',
      maxWidth: 380,
      alignSelf: 'center',
      backgroundColor: colors.surface,
      borderRadius: 26,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: 22,
      gap: 14,
      elevation: 12,
      alignItems: 'center',
    },
    modalBadge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    modalMessage: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    promptHeaderTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      alignSelf: 'flex-start',
    },
    promptHeaderMessage: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      alignSelf: 'flex-start',
    },
    promptInput: {
      width: '100%',
      color: colors.text,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 14,
      borderCurve: 'continuous',
      backgroundColor: colors.surfaceRaised,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
      width: '100%',
    },
    modalButton: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    modalButtonSecondary: {
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalSecondaryLabel: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '600',
    },
    modalPrimaryLabel: {
      color: ON_ACCENT,
      fontSize: 15,
      fontWeight: '600',
    },
  })
