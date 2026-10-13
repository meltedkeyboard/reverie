import { Image } from 'expo-image'

import { Icon } from '@/components/visuals/Icon'
import { usePathname, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/visuals/Avatar'
import { InlineMarkdown } from '@/components/chat/Markdown'
import { openInNewTab, useMiddleClick, wantsNewTab } from '@/components/chrome/TabBar'
import type { Character } from '@/db/characters'
import { deleteChat, duplicateChat, listChats, setChatTitle } from '@/db/chats'
import { listRoomChats, type Room } from '@/db/rooms'
import { useDatabase } from '@/db/provider'
import { listSearchChats, type SearchChat } from '@/db/search'
import { RAIL_WIDTH, SIDEBAR_WIDTH, sidebarFold, sidebarWidthAt, useMarkSidebarShown } from '@/hooks/util/sidebarMotion'
import { useWindowKey } from '@/hooks/util/useWindowKey'
import { t, useTranslation } from '@/i18n'
import { countLabel } from '@/lib/core/format'
import { onChatsChanged } from '@/lib/chat/chatEvents'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chat/chatDialogs'
import { showSheet } from '@/lib/ui/dialogs'
import { isDesktop, isElectron, isWeb } from '@/lib/core/platform'
import { fonts, useColors, useStyles, useTheme, type Colors } from '@/theme'

export { SIDEBAR_WIDTH }
const LABEL_GAP = isDesktop ? 8 : 10
const SLIDE = { duration: 220, easing: Easing.out(Easing.cubic) }
const COLLAPSED_KEY = 'reverie.sidebarCollapsed'

// Kept per window profile, not in the database: it is a habit of this screen, not data.
function readCollapsed() {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(value: boolean) {
  try {
    globalThis.localStorage?.setItem(COLLAPSED_KEY, value ? '1' : '0')
  } catch {}
}

// Whether the sidebar is folded to a rail. Shared, so the desktop title bar can hold the
// button that folds it.
let collapsedNow = readCollapsed()
const collapsedListeners = new Set<() => void>()

export function toggleSidebar() {
  collapsedNow = !collapsedNow
  writeCollapsed(collapsedNow)
  collapsedListeners.forEach((listener) => listener())
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(
    (listener) => {
      collapsedListeners.add(listener)
      return () => collapsedListeners.delete(listener)
    },
    () => collapsedNow
  )
}

const ICON_LIGHT = require('../../../assets/brand/icon-light.svg')
const ICON_DARK = require('../../../assets/brand/icon-dark.svg')

// The button that folds the sidebar. On the web it is the square app icon, so the logo stays
// in sight; on a tablet, the usual three lines.
export function SidebarToggle() {
  const colors = useColors()
  const { scheme } = useTheme()
  const collapsed = useSidebarCollapsed()
  return (
    <Pressable
      onPress={toggleSidebar}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t(collapsed ? 'sidebar.expand' : 'sidebar.collapse')}
      style={(state) => [toggleStyles.button, isWeb && (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceRaised }]}
    >
      {isWeb ? (
        <Image source={scheme === 'light' ? ICON_LIGHT : ICON_DARK} style={[toggleStyles.logo, { borderColor: colors.borderStrong }]} />
      ) : (
        <Icon name="menu-outline" size={22} color={colors.textMuted} />
      )}
    </Pressable>
  )
}

const toggleStyles = StyleSheet.create({
  button: isWeb
    ? { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }
    : { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // The icon's own fill is close to the bar's grey; the outline keeps it a square.
  logo: { width: 20, height: 20, borderRadius: 5, borderWidth: 1 },
})

type SidebarChat = SearchChat & {
  lastMessage?: string | null
}

type Group = { label: string; chats: SidebarChat[] }

// Chats by the day of their last line, newest first, like the sidebar of ChatGPT.
function groupChats(chats: SidebarChat[]): Group[] {
  const day = 24 * 60 * 60 * 1000
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const buckets: Group[] = [
    { label: t('format.today'), chats: [] },
    { label: t('format.yesterday'), chats: [] },
    { label: t('sidebar.last7'), chats: [] },
    { label: t('sidebar.earlier'), chats: [] },
  ]
  for (const chat of chats) {
    const age = startOfToday - chat.lastActivity
    const index = age <= 0 ? 0 : age <= day ? 1 : age <= 7 * day ? 2 : 3
    buckets[index].chats.push(chat)
  }
  return buckets.filter((group) => group.chats.length > 0)
}

type SidebarProps = {
  drawer?: boolean
  onSelect?: () => void
  character?: Character | null
  room?: Room | null
  onSwitchChat?: (chatId: number) => void
  onNewChat?: () => void
}

// The wide layout's navigation: where the bottom tabs are on a phone. A flat list of every
// chat and scene under a few places to go.
export function Sidebar({ drawer = false, onSelect, character, room, onSwitchChat, onNewChat }: SidebarProps = {}) {
  const db = useDatabase()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const [chats, setChats] = useState<SidebarChat[] | null>(null)
  const collapsedSetting = useSidebarCollapsed()
  const isScoped = Boolean(drawer && (character || room))
  const collapsed = drawer || isScoped ? false : collapsedSetting
  // 0 = open, 1 = a rail of icons. The width and the fade of the text follow it.
  const progress = sidebarFold
  useMarkSidebarShown()
  // On mounting it takes its state at once; after that each fold slides.
  const mounted = useRef(false)
  useEffect(() => {
    if (drawer || isScoped) return
    progress.value = mounted.current ? withTiming(collapsed ? 1 : 0, SLIDE) : collapsed ? 1 : 0
    mounted.current = true
    setTip(null)
  }, [collapsed, drawer, isScoped, progress])
  // In the rail a row under the pointer shows its name beside it. The root clips what is
  // past its width, so the label is drawn by the shell around it.
  const shellRef = useRef<View>(null)
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null)
  const tipFor = (label: string) => (target: HTMLElement | null) => {
    const shell = shellRef.current as unknown as HTMLElement | null
    if (!collapsed || !target || !shell) return setTip(null)
    const row = target.getBoundingClientRect()
    setTip({ label, top: row.top - shell.getBoundingClientRect().top + row.height / 2 })
  }
  const rootStyle = useAnimatedStyle(() => ({ width: drawer || isScoped ? '100%' : sidebarWidthAt(progress.value) }))
  const fade = useAnimatedStyle(() => ({ opacity: drawer || isScoped ? 1 : 1 - progress.value }))
  // The space before a label closes with it, or in the rail it squeezed the icon.
  const labelFade = useAnimatedStyle(() => ({
    opacity: drawer || isScoped ? 1 : 1 - progress.value,
    marginLeft: LABEL_GAP * (drawer || isScoped ? 1 : 1 - progress.value),
  }))
  // Ctrl+B, as in many editors and chat apps.
  useWindowKey(
    (e) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b',
    (e) => {
      e.preventDefault()
      toggleSidebar()
    }
  )

  const reload = useCallback(() => {
    if (isScoped && character) {
      listChats(db, character.id).then((raw) => {
        setChats(
          raw.map((c) => ({
            id: c.id,
            title: c.title,
            roomId: null,
            ownerName: character.name,
            ownerAvatar: character.avatar,
            lastActivity: c.lastActivity,
            lastMessage: c.lastMessage,
          }))
        )
      })
    } else if (isScoped && room) {
      listRoomChats(db, room.id).then((raw) => {
        setChats(
          raw.map((c) => ({
            id: c.id,
            title: c.title,
            roomId: room.id,
            ownerName: room.name,
            ownerAvatar: room.background,
            lastActivity: c.lastActivity,
            lastMessage: c.lastSpeaker && c.lastMessage ? `${c.lastSpeaker}: ${c.lastMessage}` : c.lastMessage,
          }))
        )
      })
    } else {
      listSearchChats(db).then(setChats)
    }
  }, [db, isScoped, character, room])

  useEffect(() => {
    reload()
    return onChatsChanged(reload)
  }, [reload])

  const groups = useMemo(() => (chats ? groupChats(chats) : []), [chats])
  const activeChat = pathname.startsWith('/chat/') ? Number(pathname.split('/')[2]) : null

  const isTabRoute = (href: string) =>
    href === '/' || href === '/rooms' || href === '/search'

  const backHref = room ? '/rooms' : '/'

  const goBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace(backHref as never)
    }
  }

  // On the web, with Ctrl or the middle button, a place opens in a tab of its own.
  const go = (href: string) => (event?: unknown) => {
    if (isWeb && wantsNewTab(event)) {
      onSelect?.()
      openInNewTab(href)
      return
    }
    if (drawer) {
      if (href === backHref || isTabRoute(href)) {
        goBack()
        return
      }
      if (href === '/settings' || href.startsWith('/character/') || href.startsWith('/room/')) {
        router.push(href as never)
        return
      }
      onSelect?.()
      if (href.startsWith('/chat/')) {
        router.replace(href as never)
        return
      }
      router.navigate(href as never)
      return
    }
    onSelect?.()
    if (href.startsWith('/chat/')) {
      router.replace(href as never)
      return
    }
    router.navigate(href as never)
  }

  const openMenu = (chat: SidebarChat) => {
    const defaultTitle = isScoped && character ? t('sidebar.untitled') : chat.ownerName
    showSheet(chat.title ?? defaultTitle, [
      {
        label: t('chat.menuRename'),
        onSelect: () =>
          promptRenameChat(chat.title, async (title) => {
            await setChatTitle(db, chat.id, title)
            reload()
          }),
      },
      {
        label: t('chat.menuDuplicate'),
        onSelect: async () => {
          const title = chat.title ? `${chat.title} (${t('characters.copySuffix')})` : null
          await duplicateChat(db, chat.id, title)
          reload()
        },
      },
      {
        label: t('chat.menuDeleteChat'),
        destructive: true,
        onSelect: () =>
          confirmDeleteChat(async () => {
            await deleteChat(db, chat.id)
            if (activeChat === chat.id) {
              if (isScoped && character) {
                if (drawer && onNewChat) onNewChat()
                else router.replace(`/chat/new?character=${character.id}`)
              } else if (isScoped && room) {
                if (drawer && onNewChat) onNewChat()
                else router.replace(`/chat/new?room=${room.id}`)
              } else {
                router.replace('/')
              }
            }
            reload()
            onSelect?.()
          }),
      },
    ])
  }

  const desktopNav = [
    { href: '/', path: '/', icon: 'people-outline' as const, label: t('characters.title'), isBack: false },
    { href: '/rooms', path: '/rooms', icon: 'chatbubbles-outline' as const, label: t('rooms.title'), isBack: false },
    { href: '/search', path: '/search', icon: 'search-outline' as const, label: t('search.title'), isBack: false },
  ]

  const scopedNav = [
    { href: backHref, path: backHref, icon: 'chevron-back' as const, label: t('common.back'), isBack: true },
  ]

  const nav = drawer ? scopedNav : desktopNav

  return (
    <View ref={shellRef} style={[styles.shell, drawer && { flex: 1 }]}>
    <Animated.View
      style={[
        styles.root,
        rootStyle,
        { paddingTop: insets.top + (isDesktop ? 8 : 12), paddingBottom: insets.bottom + 8 },
      ]}
    >
      {/* In the desktop app the button is in the title bar. */}
      {isElectron || drawer ? null : (
        <View style={styles.toggleRow}>
          <SidebarToggle />
        </View>
      )}
      <View style={styles.nav}>
        {nav.map((item) => (
          <SidebarRow
            key={item.path}
            active={pathname === item.path}
            onPress={item.isBack ? goBack : go(item.href)}
            onMiddle={() => openInNewTab(item.href)}
            onHover={tipFor(item.label)}
            style={item.isBack ? styles.backRow : undefined}
          >
            <Icon
              name={item.icon}
              size={item.isBack ? (isDesktop ? 22 : 26) : isDesktop ? 16 : 18}
              color={item.isBack ? colors.text : colors.textMuted}
              strokeWidth={item.isBack ? 2.5 : 1.75}
            />
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.navLabel,
                item.isBack && styles.backLabel,
                labelFade,
                item.isBack && { marginLeft: 8 },
              ]}
            >
              {item.label}
            </Animated.Text>
          </SidebarRow>
        ))}
      </View>

      {isScoped && character ? (
        <View style={styles.characterHeader}>
          <Pressable
            onPress={go(`/character/${character.id}?profile=1`)}
            style={({ pressed }) => [styles.characterInfo, pressed && { opacity: 0.7 }]}
          >
            <Avatar name={character.name} file={character.avatar} size={36} />
            <View style={styles.characterMeta}>
              <Text style={styles.characterName} numberOfLines={1}>
                {character.name}
              </Text>
              <Text style={styles.characterSubtitle} numberOfLines={1}>
                {chats ? countLabel(chats.length, 'chat', locale) : ''}
              </Text>
            </View>
          </Pressable>
          <View style={styles.characterActions}>
            <Pressable
              hitSlop={8}
              onPress={go(`/character/${character.id}?profile=1`)}
              style={({ pressed }) => [styles.characterBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('profile.title')}
            >
              <Icon name="information-circle-outline" size={20} color={colors.textMuted} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                onSelect?.()
                if (drawer && onNewChat) {
                  onNewChat()
                } else {
                  go(`/chat/new?character=${character.id}`)()
                }
              }}
              style={({ pressed }) => [styles.characterBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('characters.newChat')}
            >
              <Icon name="add" size={22} color={colors.accent} />
            </Pressable>
          </View>
        </View>
      ) : isScoped && room ? (
        <View style={styles.characterHeader}>
          <Pressable
            onPress={go(`/room/${room.id}`)}
            style={({ pressed }) => [styles.characterInfo, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.characterMeta}>
              <Text style={styles.characterName} numberOfLines={1}>
                {room.name}
              </Text>
              <Text style={styles.characterSubtitle} numberOfLines={1}>
                {chats ? countLabel(chats.length, 'scene', locale) : ''}
              </Text>
            </View>
          </Pressable>
          <View style={styles.characterActions}>
            <Pressable
              hitSlop={8}
              onPress={go(`/room/${room.id}`)}
              style={({ pressed }) => [styles.characterBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('rooms.edit')}
            >
              <Icon name="settings-outline" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                onSelect?.()
                if (drawer && onNewChat) {
                  onNewChat()
                } else {
                  go(`/chat/new?room=${room.id}`)()
                }
              }}
              style={({ pressed }) => [styles.characterBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('rooms.newScene')}
            >
              <Icon name="add" size={22} color={colors.accent} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <Animated.View style={[styles.list, fade]} pointerEvents={collapsed ? 'none' : 'auto'}>
      <ScrollView contentContainerStyle={styles.listContent}>
        {chats && chats.length === 0 ? <Text style={styles.empty}>{isScoped ? t('chatsList.emptyTitle') : t('sidebar.noChats')}</Text> : null}
        {groups.map((group) => (
          <View key={group.label}>
            <Text style={styles.group}>{group.label}</Text>
            {group.chats.map((chat) => (
              <SidebarRow
                key={chat.id}
                active={activeChat === chat.id}
                onPress={() => {
                  if (chat.id === activeChat) {
                    onSelect?.()
                    return
                  }
                  onSelect?.()
                  if (drawer && onSwitchChat) {
                    onSwitchChat(chat.id)
                  } else {
                    go(`/chat/${chat.id}`)()
                  }
                }}
                onMiddle={() => openInNewTab(`/chat/${chat.id}`)}
                onMenu={() => openMenu(chat)}
              >
                {!isScoped ? (
                  <Avatar name={chat.ownerName} file={chat.ownerAvatar} size={isDesktop ? 20 : 26} viewable={false} />
                ) : null}
                <View style={[styles.chatText, isScoped && styles.chatTextScoped]}>
                  {chat.title ? (
                    <>
                      <Text style={[styles.chatTitle, activeChat === chat.id && { color: colors.accent }]} numberOfLines={1}>
                        {chat.title}
                      </Text>
                      {isScoped ? (
                        chat.lastMessage ? (
                          <InlineMarkdown
                            text={chat.lastMessage}
                            style={styles.chatOwner}
                            numberOfLines={1}
                          />
                        ) : null
                      ) : (
                        <Text style={styles.chatOwner} numberOfLines={1}>
                          {chat.ownerName}
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      {isScoped ? (
                        chat.lastMessage ? (
                          <InlineMarkdown
                            text={chat.lastMessage}
                            style={[styles.chatTitle, activeChat === chat.id && { color: colors.accent }]}
                            numberOfLines={1}
                          />
                        ) : (
                          <Text style={[styles.chatTitle, activeChat === chat.id && { color: colors.accent }]} numberOfLines={1}>
                            {t('sidebar.untitled')}
                          </Text>
                        )
                      ) : (
                        <Text style={[styles.chatTitle, activeChat === chat.id && { color: colors.accent }]} numberOfLines={1}>
                          {chat.ownerName}
                        </Text>
                      )}
                    </>
                  )}
                </View>
              </SidebarRow>
            ))}
          </View>
        ))}
      </ScrollView>
      </Animated.View>

      <View style={styles.footer}>
        <SidebarRow
          active={pathname === '/settings'}
          onPress={go('/settings')}
          onMiddle={() => openInNewTab('/settings')}
          onHover={tipFor(t('settings.title'))}
        >
          <Icon name="settings-outline" size={isDesktop ? 16 : 18} color={colors.textMuted} />
          <Animated.Text numberOfLines={1} style={[styles.navLabel, labelFade]}>
            {t('settings.title')}
          </Animated.Text>
        </SidebarRow>
      </View>
    </Animated.View>
      {tip ? (
        <View style={[styles.tip, { top: tip.top }]} pointerEvents="none">
          <Text style={styles.tipText} numberOfLines={1}>
            {tip.label}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

type RowProps = {
  active: boolean
  onPress: (event?: unknown) => void
  // The middle button, which gives no press; opens the row in a new tab.
  onMiddle?: () => void
  // Shows the "..." button while the pointer is over the row.
  onMenu?: () => void
  // Told the row's element when the pointer comes onto it, and null when it leaves.
  onHover?: (target: HTMLElement | null) => void
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

function SidebarRow({ active, onPress, onMiddle, onMenu, onHover, style, children }: RowProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const [hovered, setHovered] = useState(false)
  const middleRef = useMiddleClick(() => onMiddle?.())
  // The hover sits on a wrapper that holds the row and the "..." button side by side. With
  // the button inside the row, pointing at it counted as leaving the row, and it vanished.
  // mouseenter and mouseleave do not fire for the children, so the wrapper keeps it.
  const hover = {
    onMouseEnter: (e: { currentTarget: unknown }) => {
      setHovered(true)
      onHover?.(e.currentTarget as HTMLElement)
    },
    onMouseLeave: () => {
      setHovered(false)
      onHover?.(null)
    },
  }
  return (
    <View ref={middleRef} {...hover}>
      <Pressable
        onPress={onPress}
        onLongPress={onMenu}
        // Like the cards of the lists: the chosen row is a card with an outline, a hovered
        // one shows just the outline, and a press sinks it a little.
        // On the desktop it is flat: a grey fill under the pointer and a
        // stronger one under the chosen row, no outline and no sinking.
        style={({ pressed }) =>
          isDesktop
            ? [
                styles.row,
                style,
                onMenu && styles.rowWithMenu,
                hovered && { backgroundColor: colors.surfaceRaised },
                active && { backgroundColor: colors.border },
              ]
            : [
                styles.row,
                style,
                onMenu && styles.rowWithMenu,
                hovered && { borderColor: colors.border },
                active && { backgroundColor: colors.surface, borderColor: colors.borderStrong },
                pressed && { transform: [{ scale: 0.985 }] },
              ]
        }
      >
        {children}
      </Pressable>
      {onMenu ? (
        <Pressable
          onPress={onMenu}
          hitSlop={6}
          style={[styles.more, { opacity: hovered || !isDesktop ? 1 : 0 }]}
          pointerEvents={hovered || !isDesktop ? 'auto' : 'none'}
          accessibilityLabel="…"
        >
          <Icon name="ellipsis-horizontal" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create(isDesktop ? desktopStyles(colors) : {
    shell: { zIndex: 1 },
    root: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
      paddingHorizontal: 8,
    },
    characterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 8,
      marginVertical: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    characterInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    characterMeta: { flex: 1, marginLeft: 10 },
    characterName: { color: colors.text, fontFamily: fonts.prose, fontSize: 15, fontWeight: '600' },
    characterSubtitle: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
    characterActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    characterBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    toggleRow: { alignItems: 'flex-start', marginBottom: 6 },
    nav: { gap: 2, paddingBottom: 8 },
    list: { flex: 1 },
    listContent: { paddingBottom: 8 },
    footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: 'transparent' },
    navLabel: { flex: 1, color: colors.text, fontSize: 15 },
    backRow: { paddingVertical: 10, paddingHorizontal: 8 },
    backLabel: { flex: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 19, fontWeight: '700' },
    group: { color: colors.textFaint, fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingTop: 14, paddingBottom: 4 },
    empty: { color: colors.textFaint, fontSize: 14, padding: 12 },
    chatText: { flex: 1, marginLeft: LABEL_GAP },
    chatTextScoped: { marginLeft: 0 },
    chatTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 15 },
    chatOwner: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
    rowWithMenu: { paddingRight: 36 },
    tip: { position: 'absolute', left: RAIL_WIDTH + 6, transform: 'translateY(-50%)', backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
    tipText: { color: colors.text, fontSize: 13 },
    more: { position: 'absolute', right: 8, top: 0, bottom: 0, width: 24, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  })

// The desktop sidebar: the secondary grey, small plain text, tight rows with a little rounding.
const desktopStyles = (colors: Colors) => ({
  shell: { zIndex: 1 },
  root: {
    flex: 1,
    overflow: 'hidden' as const,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 8,
  },
  characterHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 8,
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  characterInfo: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const },
  characterMeta: { flex: 1, marginLeft: 8 },
  characterName: { color: colors.text, fontFamily: fonts.prose, fontSize: 13.5, fontWeight: '600' as const },
  characterSubtitle: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
  characterActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  characterBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surfaceRaised,
  },
  toggleRow: { alignItems: 'flex-start' as const, marginBottom: 4 },
  nav: { gap: 1, paddingBottom: 8 },
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 6, paddingVertical: 4, minHeight: 28, borderRadius: 5 },
  navLabel: { flex: 1, color: colors.text, fontSize: 13.5 },
  backRow: { paddingVertical: 8, paddingHorizontal: 8 },
  backLabel: { flex: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 16.5, fontWeight: '700' as const },
  group: { color: colors.textFaint, fontSize: 12, fontWeight: '500' as const, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4 },
  empty: { color: colors.textFaint, fontSize: 13, padding: 8 },
  chatText: { flex: 1, marginLeft: LABEL_GAP },
  chatTextScoped: { marginLeft: 0 },
  chatTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 14 },
  chatOwner: { color: colors.textFaint, fontSize: 11.5, marginTop: 1 },
  rowWithMenu: { paddingRight: 32 },
  tip: { position: 'absolute' as const, left: RAIL_WIDTH + 6, transform: 'translateY(-50%)', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  tipText: { color: colors.text, fontSize: 12.5 },
  more: { position: 'absolute' as const, right: 6, top: 0, bottom: 0, width: 22, alignSelf: 'center' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
})
