import { Icon } from '@/components/visuals/Icon'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import type { SQLiteDatabase } from 'expo-sqlite'
import { useRouter } from 'expo-router'
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import { ChatBackdrop, useChatBackdrop, useChatBackdropTone, type ChatLook } from '@/components/chrome/ChatChrome'
import { Button } from '@/components/controls/Button'
import { EmptyState, emptyButtonStyle } from '@/components/lists/EmptyState'
import { NativeActionRow, NativeAreaRow, NativeHostedRow, NativeLinkRow, NativeSection, NativeSheetForm, nativeForm } from '@/components/lists/NativeForm'
import { NativeMenu, type MenuItem } from '@/components/overlays/NativeMenu'
import { Avatar } from '@/components/visuals/Avatar'
import { Star } from '@/components/visuals/motifs/Star'
import { listRecentAttachments } from '@/db/attachments'
import type { MessageImage } from '@/db/messages'
import { deletePersona, listPersonas, onPersonasChanged, type Persona } from '@/db/personas'
import { useDatabase } from '@/db/provider'
import { isRecentAttachmentsEnabled, loadRecentSettings } from '@/db/recentAttachments'
import { useTranslation } from '@/i18n'
import { choosePersona, type AttachSession } from '@/lib/chat/attachSession'
import { isDesktop, isIOS, isWeb } from '@/lib/core/platform'
import { pictureUri } from '@/lib/images/attachments'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import * as Haptics from '@/lib/ui/haptics'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { type Colors, FILL, ON_ACCENT, SchemeOverride, useColors, useStyles, useTheme } from '@/theme'

import { GlassButton } from '../chrome/Glass'
import { BottomSheet, SheetBackdropContext, useSheetTones } from '../overlays/BottomSheet'
import { SFIcon } from '../visuals/SFIcon'

// The latest pictures sent for the row at the top of the menu, null when it is switched off.
export async function loadRecentPictures(db: SQLiteDatabase): Promise<MessageImage[] | null> {
  try {
    if (!(await isRecentAttachmentsEnabled(db))) return null
    const { count, unlimited } = await loadRecentSettings(db)
    return await listRecentAttachments(db, unlimited ? null : count)
  } catch {
    return []
  }
}

// What a row of the system's list draws under it where the app's own view stands alone.
const CLEAR = '#00000000'

// Closes the menu; `then` runs once it is fully off the screen (see attachSession.ts).
type Close = (then?: () => void) => void

// The scroll view of a screen of the system sheet (app/attach) fills the screen. `flex: 1`
// over the sheet's own `flexGrow: 0` would not do: an explicit flexGrow wins over `flex`
// in Yoga, leaving a basis of 0 and a scroll view with no height.
export const fillScreen = { flexGrow: 1, flexShrink: 1, flexBasis: 0 }

// The main screen of the attach menu: the camera and the latest pictures in one row,
// files and the persona, the chat's thinking switch, and the button that attaches the
// pictures ticked in the row.
export function AttachMenu({
  session,
  onClose,
  onOpenPersonas,
  onOpenDirection,
  scrollStyle,
}: {
  session: AttachSession
  onClose: Close
  onOpenPersonas: () => void
  onOpenDirection?: () => void
  scrollStyle?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const backdrop = useContext(SheetBackdropContext)
  const db = useDatabase()
  const [thinking, setThinking] = useState(!!session.thinking)
  // undefined while being read, null when the row is switched off in Settings.
  const [recents, setRecents] = useState<MessageImage[] | null | undefined>(session.recents)
  const [selected, setSelected] = useState<MessageImage[]>([])
  // No row until there is a picture to put in it: the camera then sits in the card, as with the row off.
  const showRow = !!recents?.length

  // Read here only when the opening did not bring them.
  useEffect(() => {
    if (session.recents !== undefined) return
    let alive = true
    loadRecentPictures(db).then((list) => alive && setRecents(list))
    return () => {
      alive = false
    }
  }, [db, session])

  const toggleRecent = (picture: MessageImage) => {
    Haptics.selectionAsync()
    setSelected((current) =>
      current.some((p) => p.file === picture.file) ? current.filter((p) => p.file !== picture.file) : [...current, picture]
    )
  }

  const confirmRecents = () => {
    if (!selected.length) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    session.onAttach(selected)
    onClose()
  }

  const hasSelection = selected.length > 0
  const footerProgress = useSharedValue(0)
  useEffect(() => {
    footerProgress.value = withSpring(hasSelection ? 1 : 0, { stiffness: 300, damping: 28, mass: 0.8 })
  }, [hasSelection, footerProgress])

  const [footerHeight, setFooterHeight] = useState(0)
  const animatedFooterStyle = useAnimatedStyle(() => {
    const travel = footerHeight || 120
    return {
      transform: [{ translateY: (1 - footerProgress.value) * travel }],
      opacity: footerProgress.value > 0.01 ? 1 : 0,
    }
  })

  const actionLabel =
    selected.length === 1
      ? t('attach.attachSingle')
      : t('attach.attachMultiple', { count: selected.length })

  const camera = !isWeb ? (
    <Pressable
      onPress={() => onClose(() => session.onPick('camera'))}
      accessibilityRole="button"
      accessibilityLabel={t('imageSource.camera')}
      style={({ pressed }) => [styles.cameraTile, { backgroundColor: pressed ? tones.pressed : tones.card }]}
    >
      <Icon name="camera-outline" size={30} color={colors.text} />
      <Text style={styles.cameraLabel} numberOfLines={1}>
        {t('imageSource.camera')}
      </Text>
    </Pressable>
  ) : null

  const tiles = showRow ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={[styles.tilesRow, nativeForm && styles.tilesInList]}
    >
      {camera}

      {recents.map((item) => {
        // Where it stands among the ticked ones: the pictures go into the message in that order.
        const order = selected.findIndex((p) => p.file === item.file) + 1
        const isSelected = order > 0
        return (
          <Pressable
            key={item.file}
            onPress={() => toggleRecent(item)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={t('attach.recent')}
            accessibilityValue={isSelected ? { text: String(order) } : undefined}
            style={styles.recentTile}
          >
            <Image source={{ uri: pictureUri(item) }} style={styles.recentTileImage} contentFit="cover" />
            {isSelected ? (
              <View style={styles.recentCheckBadge}>
                <Text style={styles.recentOrder}>{order}</Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </ScrollView>
  ) : null

  const action = showRow ? (
    <Pressable
      onPress={confirmRecents}
      accessibilityRole="button"
      accessibilityLabel={actionLabel}
      style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.85 }]}
    >
      <View style={[StyleSheet.absoluteFill, styles.actionBg, { backgroundColor: colors.accent }]} />
      <Text style={[styles.actionText, { color: ON_ACCENT }]}>{actionLabel}</Text>
    </Pressable>
  ) : null

  // Over the chat's background the bar under the button is frosted over it, as the rest of
  // the menu shows it, instead of the sheet's own color.
  const footer = action ? (
    <Animated.View
      onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
      pointerEvents={hasSelection ? 'auto' : 'none'}
      style={[
        styles.actionFooter,
        {
          paddingBottom: Math.max(16, insets.bottom + 4),
          backgroundColor: backdrop ? 'transparent' : tones.sheet,
          borderTopColor: colors.border,
        },
        animatedFooterStyle,
      ]}
    >
      {backdrop ? <BlurView tint={scheme} intensity={55} style={FILL} /> : null}
      {action}
    </Animated.View>
  ) : null

  const toggleThinking = (value: boolean) => {
    Haptics.selectionAsync()
    setThinking(value)
    session.onToggleThinking?.(value)
  }
  const openPersonas = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onOpenPersonas()
  }
  const openDirection = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onOpenDirection?.()
  }

  // The same menu as the system's own list (iOS with SwiftUI), over the chat's picture as the
  // app's cards are. The row of the camera and the latest pictures and the button that attaches
  // them are the app's own, in rows of the list with nothing drawn under them; the camera
  // without the row, files, the persona and the thinking switch are the system's rows.
  if (nativeForm) {
    const { Button: SwiftButton, Toggle } = nativeForm.ui
    const { tint } = nativeForm.modifiers
    return (
      <View style={[styles.menuContainer, scrollStyle]}>
        <NativeSheetForm>
          {tiles ? (
            <NativeSection fill={CLEAR} top>
              <NativeHostedRow clear>{tiles}</NativeHostedRow>
            </NativeSection>
          ) : null}
          <NativeSection fill={tones.card} top={!tiles} footer={recents === null ? t('attach.recentsOff') : undefined}>
            {!showRow ? (
              <SwiftButton label={t('imageSource.camera')} systemImage="camera" onPress={() => onClose(() => session.onPick('camera'))} modifiers={[tint(colors.text)]} />
            ) : null}
            <SwiftButton label={t('attach.addFiles')} systemImage="doc" onPress={() => onClose(() => session.onPick('files'))} modifiers={[tint(colors.text)]} />
            <NativeLinkRow
              label={t('attach.persona')}
              symbol="person"
              value={session.persona?.name ? session.persona.name : t('attach.personaNone')}
              onPress={openPersonas}
            />
            {onOpenDirection ? (
              <NativeLinkRow
                label={t('direction.title')}
                symbol="signpost.right"
                value={session.direction?.trim() || undefined}
                onPress={openDirection}
              />
            ) : null}
          </NativeSection>
          {session.onToggleThinking ? (
            <NativeSection fill={tones.card}>
              <Toggle label={t('chat.thinking')} systemImage="brain" isOn={thinking} onIsOnChange={toggleThinking} />
            </NativeSection>
          ) : null}
          {showRow ? (
            <NativeSection fill={CLEAR}>
              <NativeHostedRow clear height={Math.max(76, insets.bottom + 68)}>
                <View />
              </NativeHostedRow>
            </NativeSection>
          ) : null}
        </NativeSheetForm>
        {footer}
      </View>
    )
  }

  return (
    <View style={[styles.menuContainer, scrollStyle]}>
      <ScrollView
        style={[styles.scroll, scrollStyle]}
        contentContainerStyle={[styles.content, showRow ? { paddingBottom: Math.max(76, insets.bottom + 68) } : null]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tiles}

        <View style={[styles.card, { backgroundColor: tones.card }]}>
          {/* Without the pictures row, the camera is a row of its own here. */}
          {!showRow && !isWeb ? (
            <>
              <Pressable
                onPress={() => onClose(() => session.onPick('camera'))}
                accessibilityRole="button"
                accessibilityLabel={t('imageSource.camera')}
                style={({ pressed }) => [styles.cardRow, { backgroundColor: pressed ? tones.pressed : tones.row }]}
              >
                <Icon name="camera-outline" size={22} color={colors.text} />
                <Text style={styles.cardLabel}>{t('imageSource.camera')}</Text>
              </Pressable>

              <View style={[styles.separator, { backgroundColor: colors.borderStrong }]} />
            </>
          ) : null}

          <Pressable
            onPress={() => onClose(() => session.onPick('files'))}
            accessibilityRole="button"
            accessibilityLabel={t('attach.addFiles')}
            style={({ pressed }) => [styles.cardRow, { backgroundColor: pressed ? tones.pressed : tones.row }]}
          >
            <Icon name="document-outline" size={22} color={colors.text} />
            <Text style={styles.cardLabel}>{t('attach.addFiles')}</Text>
          </Pressable>

          <View style={[styles.separator, { backgroundColor: colors.borderStrong }]} />

          <Pressable
            onPress={openPersonas}
            accessibilityRole="button"
            accessibilityLabel={t('attach.persona')}
            style={({ pressed }) => [styles.cardRow, { backgroundColor: pressed ? tones.pressed : tones.row }]}
          >
            <Icon name="person-outline" size={22} color={colors.text} />
            <Text style={styles.cardLabel}>{t('attach.persona')}</Text>
            <View style={styles.cardTrailing}>
              <Text style={styles.cardTrailingText} numberOfLines={1}>
                {session.persona?.name ? session.persona.name : t('attach.personaNone')}
              </Text>
              <Icon name="chevron-forward" size={17} color={colors.textFaint} />
            </View>
          </Pressable>

          {onOpenDirection ? (
            <>
              <View style={[styles.separator, { backgroundColor: colors.borderStrong }]} />

              <Pressable
                onPress={openDirection}
                accessibilityRole="button"
                accessibilityLabel={t('direction.title')}
                style={({ pressed }) => [styles.cardRow, { backgroundColor: pressed ? tones.pressed : tones.row }]}
              >
                <SFIcon name="signpost.right" fallback="compass-outline" size={22} color={colors.text} />
                <Text style={styles.cardLabel}>{t('direction.title')}</Text>
                <View style={styles.cardTrailing}>
                  {session.direction?.trim() ? (
                    <Text style={styles.cardTrailingText} numberOfLines={1}>
                      {session.direction.trim()}
                    </Text>
                  ) : null}
                  <Icon name="chevron-forward" size={17} color={colors.textFaint} />
                </View>
              </Pressable>
            </>
          ) : null}
        </View>
        {recents === null ? <Text style={styles.recentsOff}>{t('attach.recentsOff')}</Text> : null}

        {session.onToggleThinking ? (
          <View style={[styles.card, styles.cardSecondary, { backgroundColor: tones.card }]}>
            <View style={[styles.cardRow, styles.thinkingRow]}>
              <View style={styles.thinkingLeft}>
                <SFIcon name="brain" fallback="sparkles-outline" size={22} color={colors.text} />
                <Text style={styles.cardLabel}>{t('chat.thinking')}</Text>
              </View>
              <Switch
                value={thinking}
                onValueChange={toggleThinking}
                accessibilityLabel={t('chat.thinking')}
                trackColor={{ true: colors.accent, false: isIOS ? undefined : colors.borderStrong }}
                {...(isDesktop ? ({ thumbColor: '#FFFFFF', activeThumbColor: '#FFFFFF' } as object) : {})}
                style={styles.nativeSwitch}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
      {footer}
    </View>
  )
}

// The personas to speak as in this chat, with "none" first; a row's ellipsis edits or
// deletes it without choosing it.
export function PersonaPicker({
  session,
  onClose,
  onChosen,
  scrollStyle,
}: {
  session: AttachSession
  onClose: Close
  // Back to the main screen of the menu, which stays open.
  onChosen: () => void
  scrollStyle?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const db = useDatabase()
  const router = useRouter()
  const [personas, setPersonas] = useState<Persona[]>([])
  const currentId = session.personaId ?? session.persona?.id ?? null

  useEffect(() => {
    let alive = true
    const load = () => {
      listPersonas(db).then((list) => {
        if (alive) setPersonas(list)
      })
    }
    load()
    const unsub = onPersonasChanged(load)
    return () => {
      alive = false
      unsub()
    }
  }, [db])

  const choose = (persona: Persona | null) => {
    Haptics.selectionAsync()
    choosePersona(session, persona)
    onChosen()
  }

  // In a row of the system's list, which draws the card, the row has no fill and does not
  // light up under the touch: the list does not light its rows that are the app's own, and a
  // highlight of the app's beside the system's rows would be the odd one out.
  const rowFill = (pressed: boolean) => (nativeForm ? 'transparent' : pressed ? tones.pressed : tones.row)

  const noneRow = (
    <Pressable
      onPress={() => choose(null)}
      accessibilityRole="button"
      accessibilityLabel={t('persona.none')}
      style={({ pressed }) => [styles.personaRow, { backgroundColor: rowFill(pressed) }]}
    >
      <View style={[styles.personaIconCircle, { backgroundColor: colors.surfaceRaised }]}>
        <Icon name="person-outline" size={20} color={colors.textMuted} />
      </View>
      <View style={styles.personaText}>
        <Text style={styles.personaName}>{t('persona.none')}</Text>
        <Text style={styles.personaSubtitle}>{t('persona.noneSubtitle')}</Text>
      </View>
      {currentId === null ? <SFIcon name="checkmark" fallback="checkmark" size={18} color={colors.accent} /> : null}
    </Pressable>
  )

  const personaRow = (item: Persona) => {
    const isSelected = currentId === item.id
    const menu: MenuItem[] = [
      {
        label: t('persona.edit'),
        systemImage: 'pencil',
        onSelect: () => onClose(() => router.push(`/persona/${item.id}`)),
      },
      {
        label: t('persona.delete'),
        systemImage: 'trash',
        destructive: true,
        onSelect: () => {
          confirmDeletion({
            title: t('persona.delete'),
            message: t('persona.deleteConfirm', { name: item.name }),
            confirmLabel: t('persona.delete'),
            destructive: true,
            onConfirm: async () => {
              if (isSelected) choosePersona(session, null)
              await deletePersona(db, item.id)
            },
          })
        },
      },
    ]
    return (
      <View style={styles.personaRowContainer}>
        <Pressable
          onPress={() => choose(item)}
          accessibilityRole="button"
          accessibilityLabel={item.name}
          style={({ pressed }) => [styles.personaRow, { backgroundColor: rowFill(pressed) }]}
        >
          <Avatar name={item.name} file={item.avatar} size={36} />
          <View style={styles.personaText}>
            <View style={styles.personaNameRow}>
              <Text style={styles.personaName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isDefault ? <Star size={12} color={colors.accent} /> : null}
            </View>
            {item.description ? (
              <Text style={styles.personaSubtitle} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>
          {isSelected ? <SFIcon name="checkmark" fallback="checkmark" size={18} color={colors.accent} /> : null}
        </Pressable>
        <View style={styles.personaMenuWrapper} onStartShouldSetResponder={() => true}>
          <NativeMenu items={menu}>
            <View style={styles.personaEditButton}>
              <Icon name="ellipsis-horizontal" size={18} color={colors.textFaint} />
            </View>
          </NativeMenu>
        </View>
      </View>
    )
  }

  if (personas.length === 0) {
    return (
      <ScrollView
        style={[styles.scroll, scrollStyle]}
        contentContainerStyle={[styles.content, styles.personaContent]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.personaEmpty}>
          <EmptyState
            title={t('persona.emptyTitle')}
            text={t('persona.emptyText')}
            action={
              <Button
                variant="glass"
                label={t('persona.create')}
                style={emptyButtonStyle}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  onClose(() => router.push('/persona/new'))
                }}
              />
            }
          />
        </View>
      </ScrollView>
    )
  }

  // In the system's own list (iOS with SwiftUI) the rows stay the app's, with their photo, the
  // star of the default and the ellipsis of each. A row is made anew whenever one above it
  // goes, or the list would leave it blank (see NativeHostedRow).
  if (nativeForm) {
    return (
      <NativeSheetForm>
        <NativeSection fill={tones.card} top>
          <NativeHostedRow>{noneRow}</NativeHostedRow>
          {personas.map((item, index) => (
            <NativeHostedRow key={`${item.id}:${index}`}>{personaRow(item)}</NativeHostedRow>
          ))}
        </NativeSection>
      </NativeSheetForm>
    )
  }

  return (
    <ScrollView
      style={[styles.scroll, scrollStyle]}
      contentContainerStyle={[styles.content, styles.personaContent]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { backgroundColor: tones.card }]}>
        {noneRow}
        {personas.map((item) => (
          <View key={item.id}>
            <View style={[styles.separator, { backgroundColor: colors.borderStrong }]} />
            {personaRow(item)}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

// The direction editor, inside the attach sheet.
export function DirectionEditor({
  session,
  onDone,
  scrollStyle,
}: {
  session: AttachSession
  onDone?: () => void
  scrollStyle?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const [value, setValue] = useState(session.direction ?? '')

  const handleChange = (text: string) => {
    setValue(text)
    session.direction = text
    session.onSetDirection?.(text)
  }

  const handleClear = () => {
    Haptics.selectionAsync()
    setValue('')
    session.direction = ''
    session.onSetDirection?.('')
  }

  if (nativeForm) {
    return (
      <NativeSheetForm>
        <NativeSection fill={tones.card} top>
          <NativeAreaRow
            value={value}
            onChangeText={handleChange}
            placeholder={t('direction.placeholder')}
            lines={6}
            maxLines={15}
          />
        </NativeSection>
        {value.trim() ? (
          <NativeSection fill={tones.card}>
            <NativeActionRow label={t('direction.clear')} destructive onPress={handleClear} />
          </NativeSection>
        ) : null}
      </NativeSheetForm>
    )
  }

  return (
    <ScrollView
      style={[styles.scroll, scrollStyle]}
      contentContainerStyle={[styles.content, styles.personaContent]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { backgroundColor: tones.card }]}>
        <TextInput
          value={value}
          onChangeText={handleChange}
          placeholder={t('direction.placeholder')}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          multiline
          style={[styles.directionInput, { color: colors.text }]}
        />
      </View>
      {value.trim() ? (
        <View style={[styles.card, styles.cardSecondary, { backgroundColor: tones.card }]}>
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.cardRow, pressed && { backgroundColor: tones.pressed }]}
          >
            <Icon name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.cardLabel, { color: colors.danger }]}>{t('direction.clear')}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  )
}

// The whole stack of the system sheet (iOS, app/attach), which its screens measure the bar against.
export const AttachStackContext = createContext<RefObject<View | null> | null>(null)

// A screen of the system sheet (the attach menu's, the cast's). Over the chat's background the bar is see-through and the
// screen draws the background itself, so a screen pushed covers the one under it as it
// slides in. The system lays the screen out below the bar; the background reaches up under
// the bar by as far as the screen's top is below the stack's, measured, since the height
// the stack reports for its bar is not to be trusted inside a sheet.
export function AttachScreenFrame({ look, children }: { look: ChatLook | null | undefined; children: React.ReactNode }) {
  const backdrop = useChatBackdrop(look)
  const stack = useContext(AttachStackContext)
  const self = useRef<View>(null)
  const [bar, setBar] = useState(0)
  const measure = () =>
    stack?.current?.measureInWindow((_x, top) =>
      self.current?.measureInWindow((_sx, y) => {
        setBar(Math.max(0, y - top))
      })
    )
  if (!backdrop) return <>{children}</>
  return (
    // Kept a view of its own: flattened, the background and the menu's scroll view would be
    // the screen's own children, and react-native-screens takes a view before a sheet's
    // scroll view for a header and moves the scroll view down by its height, here the
    // whole screen, so the menu went out of sight.
    <View
      ref={self}
      collapsable={false}
      style={fillScreen}
      onLayout={() => {
        measure()
        requestAnimationFrame(measure)
      }}
    >
      <View pointerEvents="none" style={[FILL, { top: -bar }]}>
        <ChatBackdrop owner={look} />
      </View>
      {children}
    </View>
  )
}

type AttachSheetProps = {
  visible: boolean
  session: AttachSession | null
  onClose: Close
  onDismissed: () => void
}

// The menu in the app's own bottom sheet, where there is no system one (the web, the
// desktop, Android); the persona picker slides in over it within the same sheet. Over the
// chat's picture it takes the scheme the picture reads best in, blurred as the sheet shows it.
export function AttachSheet(props: AttachSheetProps) {
  const scheme = useChatBackdropTone(props.session?.look)
  return (
    <SchemeOverride scheme={scheme}>
      <SheetBackdropContext.Provider value={scheme !== null}>
        <AttachSheetBody {...props} />
      </SheetBackdropContext.Provider>
    </SchemeOverride>
  )
}

function AttachSheetBody({ visible, session, onClose, onDismissed }: AttachSheetProps) {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const [screen, setScreen] = useState<'attach' | 'persona' | 'direction'>('attach')
  const [attachHeight, setAttachHeight] = useState<number | undefined>(undefined)
  const progress = useSharedValue(0)
  // Over the chat's background the main screen fades out under the picker instead of
  // being covered by the sheet's color, which would hide the background.
  const backdrop = useChatBackdrop(session?.look)

  const go = (to: 'attach' | 'persona' | 'direction') => {
    setScreen(to)
    progress.value = withSpring(to === 'attach' ? 0 : 1, { stiffness: 280, damping: 28, mass: 0.9 })
  }

  const attachPaneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * (width * 0.35) }],
    opacity: 1 - progress.value,
  }))
  const personaPaneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * width }],
    opacity: progress.value > 0.05 ? 1 : 0,
  }))

  const createPersona = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onClose(() => router.push('/persona/new'))
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={() => onClose()}
      onDismissed={() => {
        setScreen('attach')
        progress.value = 0
        onDismissed()
      }}
      title={
        screen === 'direction'
          ? t('direction.title')
          : screen === 'persona'
            ? t('persona.pickerTitle')
            : t('attach.addToChat')
      }
      onBack={screen !== 'attach' ? () => go('attach') : undefined}
      compactHeader
      noGlass
      glassButtons
      contentPaddingBottom={0}
      underlay={<ChatBackdrop owner={session?.look} />}
      rightItem={
        screen === 'persona' ? (
          liquidGlass ? (
            // Glass like the back button beside it, and for the same reason it comes in
            // by scale alone: glass does not render under a parent with opacity.
            <Animated.View entering={ZoomIn.springify().stiffness(280).damping(24).mass(0.85)} exiting={ZoomOut.duration(140)}>
              <GlassButton icon="add" onPress={createPersona} accessibilityLabel={t('persona.create')} />
            </Animated.View>
          ) : (
            <Pressable
              onPress={createPersona}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('persona.create')}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
            >
              <Icon name="add" size={24} color={colors.accent} />
            </Pressable>
          )
        ) : !isWeb && session ? (
          <Pressable
            onPress={() => onClose(() => session.onPick('library'))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('attach.photos')}
            style={({ pressed }) => [styles.photosHeaderBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.photosHeaderText}>{t('attach.photos')}</Text>
          </Pressable>
        ) : null
      }
    >
      {session ? (
        <View style={styles.slider}>
          <Animated.View
            style={[styles.pane, screen === 'attach' ? styles.paneActive : styles.paneAbsolute, attachPaneStyle]}
            pointerEvents={screen === 'attach' ? 'auto' : 'none'}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height
              if (h > 0) setAttachHeight(h)
            }}
          >
            <AttachMenu
              key={session.opened}
              session={session}
              onClose={onClose}
              onOpenPersonas={() => go('persona')}
              onOpenDirection={() => go('direction')}
            />
          </Animated.View>

          {/* Keeps the height of the main screen, so the sheet does not jump as it slides. */}
          <Animated.View
            style={[
              styles.pane,
              screen === 'persona' ? styles.paneActive : styles.paneAbsolute,
              attachHeight ? { minHeight: attachHeight } : null,
              { backgroundColor: backdrop ? 'transparent' : tones.sheet },
              personaPaneStyle,
            ]}
            pointerEvents={screen === 'persona' ? 'auto' : 'none'}
          >
            <PersonaPicker
              session={session}
              onClose={onClose}
              onChosen={() => go('attach')}
              // As tall as the pane even with one or two personas, so a drag anywhere below
              // them scrolls the list instead of pulling the sheet down.
              scrollStyle={attachHeight ? { minHeight: attachHeight, maxHeight: Math.max(attachHeight, 380) } : null}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.pane,
              screen === 'direction' ? styles.paneActive : styles.paneAbsolute,
              attachHeight ? { minHeight: attachHeight } : null,
              { backgroundColor: backdrop ? 'transparent' : tones.sheet },
              personaPaneStyle,
            ]}
            pointerEvents={screen === 'direction' ? 'auto' : 'none'}
          >
            <DirectionEditor
              session={session}
              onDone={() => go('attach')}
              scrollStyle={attachHeight ? { minHeight: attachHeight, maxHeight: Math.max(attachHeight, 380) } : null}
            />
          </Animated.View>
        </View>
      ) : null}
    </BottomSheet>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    menuContainer: { flex: 1, position: 'relative' },
    actionFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    photosHeaderBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    photosHeaderText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
    headerIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    slider: { overflow: 'hidden', position: 'relative', width: '100%' },
    pane: { width: '100%' },
    paneActive: { position: 'relative' },
    paneAbsolute: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    scroll: { flexGrow: 0 },
    content: { paddingHorizontal: 16, paddingBottom: 16 },
    personaContent: { paddingBottom: 24 },
    tilesRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
    // In a row of the system's list, which keeps the gap under it itself.
    tilesInList: { paddingBottom: 0 },
    cameraTile: {
      width: 96,
      height: 96,
      borderRadius: 22,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    recentsOff: { color: colors.textMuted, fontSize: 13, marginTop: 8, paddingHorizontal: 16 },
    cameraLabel: { color: colors.text, fontSize: 14, fontWeight: '500' },
    recentTile: { width: 96, height: 96, borderRadius: 22, borderCurve: 'continuous', overflow: 'hidden' },
    recentTileImage: { width: '100%', height: '100%', backgroundColor: colors.surface },
    recentCheckBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 5,
      borderRadius: 11,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentOrder: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    actionSlot: { marginTop: 18 },
    actionButton: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    actionBg: { borderRadius: 26 },
    actionText: { fontSize: 17, fontWeight: '600' },
    card: { borderRadius: 24, overflow: 'hidden' },
    cardSecondary: { marginTop: 14 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
    directionInput: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      lineHeight: 22,
      minHeight: 120,
      textAlignVertical: 'top',
    },
    separator: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
    cardLabel: { flex: 1, color: colors.text, fontSize: 17 },
    cardTrailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardTrailingText: { color: colors.textMuted, fontSize: 16 },
    thinkingRow: { justifyContent: 'space-between', paddingVertical: 12, paddingRight: 16, minHeight: 52 },
    thinkingLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
    nativeSwitch: { marginVertical: 0 },
    personaEmpty: { paddingVertical: 28, alignItems: 'center', justifyContent: 'center' },
    personaRowContainer: { flexDirection: 'row', alignItems: 'center' },
    personaRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingLeft: 16,
      paddingRight: 8,
      paddingVertical: 10,
      gap: 14,
    },
    personaIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    personaText: { flex: 1, justifyContent: 'center', gap: 2 },
    personaNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    personaName: { fontSize: 16, color: colors.text, letterSpacing: -0.2, fontWeight: '500', flexShrink: 1 },
    personaSubtitle: { fontSize: 12, color: colors.textFaint, letterSpacing: -0.1 },
    personaMenuWrapper: { paddingRight: 12, paddingLeft: 4, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
    personaEditButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  })
