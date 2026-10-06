import { Image } from 'expo-image'

import { Icon } from '@/components/visuals/Icon'
import { usePathname, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/visuals/Avatar'
import { openInNewTab, useMiddleClick, wantsNewTab } from '@/components/chrome/TabBar'
import { deleteChat, setChatTitle } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { listSearchChats, type SearchChat } from '@/db/search'
import { RAIL_WIDTH, SIDEBAR_WIDTH, sidebarFold, sidebarWidthAt, useMarkSidebarShown } from '@/hooks/util/sidebarMotion'
import { useWindowKey } from '@/hooks/util/useWindowKey'
import { t, useTranslation } from '@/i18n'
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

type Group = { label: string; chats: SearchChat[] }

// Chats by the day of their last line, newest first, like the sidebar of ChatGPT.
function groupChats(chats: SearchChat[]): Group[] {
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

// The wide layout's navigation: where the bottom tabs are on a phone. A flat list of every
// chat and scene under a few places to go.
export function Sidebar() {
  const db = useDatabase()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t: tr } = useTranslation()
  const [chats, setChats] = useState<SearchChat[] | null>(null)
  const collapsed = useSidebarCollapsed()
  // 0 = open, 1 = a rail of icons. The width and the fade of the text follow it.
  const progress = sidebarFold
  useMarkSidebarShown()
  // On mounting it takes its state at once; after that each fold slides.
  const mounted = useRef(false)
  useEffect(() => {
    progress.value = mounted.current ? withTiming(collapsed ? 1 : 0, SLIDE) : collapsed ? 1 : 0
    mounted.current = true
    setTip(null)
  }, [collapsed, progress])
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
  const rootStyle = useAnimatedStyle(() => ({ width: sidebarWidthAt(progress.value) }))
  const fade = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  // The space before a label closes with it, or in the rail it squeezed the icon.
  const labelFade = useAnimatedStyle(() => ({ opacity: 1 - progress.value, marginLeft: LABEL_GAP * (1 - progress.value) }))
  // Ctrl+B, as in many editors and chat apps.
  useWindowKey(
    (e) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b',
    (e) => {
      e.preventDefault()
      toggleSidebar()
    }
  )

  const reload = useCallback(() => {
    listSearchChats(db).then(setChats)
  }, [db])
  useEffect(() => {
    reload()
    return onChatsChanged(reload)
  }, [reload])

  const groups = useMemo(() => (chats ? groupChats(chats) : []), [chats, tr])
  const activeChat = pathname.startsWith('/chat/') ? Number(pathname.split('/')[2]) : null

  // On the web, with Ctrl or the middle button, a place opens in a tab of its own.
  const go = (href: string) => (event?: unknown) =>
    isWeb && wantsNewTab(event) ? openInNewTab(href) : router.navigate(href as never)

  const openMenu = (chat: SearchChat) => {
    showSheet(chat.title ?? chat.ownerName, [
      {
        label: t('chat.menuRename'),
        onSelect: () =>
          promptRenameChat(chat.title, async (title) => {
            await setChatTitle(db, chat.id, title)
          }),
      },
      {
        label: t('chat.menuDeleteChat'),
        destructive: true,
        onSelect: () =>
          confirmDeleteChat(async () => {
            await deleteChat(db, chat.id)
            if (activeChat === chat.id) router.replace('/')
          }),
      },
    ])
  }

  const nav = [
    { href: '/', path: '/', icon: 'people-outline' as const, label: t('characters.title') },
    { href: '/rooms', path: '/rooms', icon: 'chatbubbles-outline' as const, label: t('rooms.title') },
    { href: '/search', path: '/search', icon: 'search-outline' as const, label: t('search.title') },
  ]

  return (
    <View ref={shellRef} style={styles.shell}>
    <Animated.View
      style={[
        styles.root,
        rootStyle,
        { paddingTop: insets.top + (isDesktop ? 8 : 12), paddingBottom: insets.bottom + 8 },
      ]}
    >
      {/* In the desktop app the button is in the title bar. */}
      {isElectron ? null : (
        <View style={styles.toggleRow}>
          <SidebarToggle />
        </View>
      )}
      <View style={styles.nav}>
        {nav.map((item) => (
          <SidebarRow
            key={item.path}
            active={pathname === item.path}
            onPress={go(item.href)}
            onMiddle={() => openInNewTab(item.href)}
            onHover={tipFor(item.label)}
          >
            <Icon name={item.icon} size={isDesktop ? 16 : 18} color={colors.textMuted} />
            <Animated.Text numberOfLines={1} style={[styles.navLabel, labelFade]}>
              {item.label}
            </Animated.Text>
          </SidebarRow>
        ))}
      </View>

      <Animated.View style={[styles.list, fade]} pointerEvents={collapsed ? 'none' : 'auto'}>
      <ScrollView contentContainerStyle={styles.listContent}>
        {chats && chats.length === 0 ? <Text style={styles.empty}>{t('sidebar.noChats')}</Text> : null}
        {groups.map((group) => (
          <View key={group.label}>
            <Text style={styles.group}>{group.label}</Text>
            {group.chats.map((chat) => (
              <SidebarRow
                key={chat.id}
                active={activeChat === chat.id}
                onPress={go(`/chat/${chat.id}`)}
                onMiddle={() => openInNewTab(`/chat/${chat.id}`)}
                onMenu={() => openMenu(chat)}
              >
                <Avatar name={chat.ownerName} file={chat.ownerAvatar} size={isDesktop ? 20 : 26} viewable={false} />
                <View style={styles.chatText}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {chat.title ?? chat.ownerName}
                  </Text>
                  {chat.title ? (
                    <Text style={styles.chatOwner} numberOfLines={1}>
                      {chat.ownerName}
                    </Text>
                  ) : null}
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
  children: React.ReactNode
}

function SidebarRow({ active, onPress, onMiddle, onMenu, onHover, children }: RowProps) {
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
        // Like the cards of the lists: the chosen row is a card with an outline, a hovered
        // one shows just the outline, and a press sinks it a little.
        // On the desktop it is flat: a grey fill under the pointer and a
        // stronger one under the chosen row, no outline and no sinking.
        style={({ pressed }) =>
          isDesktop
            ? [
                styles.row,
                onMenu && styles.rowWithMenu,
                hovered && { backgroundColor: colors.surfaceRaised },
                active && { backgroundColor: colors.border },
              ]
            : [
                styles.row,
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
          style={[styles.more, { opacity: hovered ? 1 : 0 }]}
          pointerEvents={hovered ? 'auto' : 'none'}
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
    toggleRow: { alignItems: 'flex-start', marginBottom: 6 },
    nav: { gap: 2, paddingBottom: 8 },
    list: { flex: 1 },
    listContent: { paddingBottom: 8 },
    footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: 'transparent' },
    navLabel: { flex: 1, color: colors.text, fontSize: 15 },
    group: { color: colors.textFaint, fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingTop: 14, paddingBottom: 4 },
    empty: { color: colors.textFaint, fontSize: 14, padding: 12 },
    chatText: { flex: 1, marginLeft: LABEL_GAP },
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
  toggleRow: { alignItems: 'flex-start' as const, marginBottom: 4 },
  nav: { gap: 1, paddingBottom: 8 },
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 6, paddingVertical: 4, minHeight: 28, borderRadius: 5 },
  navLabel: { flex: 1, color: colors.text, fontSize: 13.5 },
  group: { color: colors.textFaint, fontSize: 12, fontWeight: '500' as const, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4 },
  empty: { color: colors.textFaint, fontSize: 13, padding: 8 },
  chatText: { flex: 1, marginLeft: LABEL_GAP },
  chatTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 14 },
  chatOwner: { color: colors.textFaint, fontSize: 11.5, marginTop: 1 },
  rowWithMenu: { paddingRight: 32 },
  tip: { position: 'absolute' as const, left: RAIL_WIDTH + 6, transform: 'translateY(-50%)', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  tipText: { color: colors.text, fontSize: 12.5 },
  more: { position: 'absolute' as const, right: 6, top: 0, bottom: 0, width: 22, alignSelf: 'center' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
})
