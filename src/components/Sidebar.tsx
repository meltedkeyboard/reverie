import Ionicons from '@expo/vector-icons/Ionicons'
import { usePathname, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/Avatar'
import { deleteChat, setChatTitle } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { listSearchChats, type SearchChat } from '@/db/search'
import { t, useTranslation } from '@/i18n'
import { onChatsChanged } from '@/lib/chatEvents'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chatDialogs'
import { showSheet } from '@/lib/dialogs'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

export const SIDEBAR_WIDTH = 300
const RAIL_WIDTH = 54
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
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = useCallback(() => {
    setCollapsed((old) => {
      writeCollapsed(!old)
      return !old
    })
  }, [])
  // 0 = open, 1 = a rail of icons. The width and the fade of the text follow it.
  const progress = useSharedValue(collapsed ? 1 : 0)
  useEffect(() => {
    progress.value = withTiming(collapsed ? 1 : 0, SLIDE)
  }, [collapsed, progress])
  const rootStyle = useAnimatedStyle(() => ({ width: SIDEBAR_WIDTH + (RAIL_WIDTH - SIDEBAR_WIDTH) * progress.value }))
  const fade = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  // Ctrl+B, as in many editors and chat apps.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const reload = useCallback(() => {
    listSearchChats(db).then(setChats)
  }, [db])
  useEffect(() => {
    reload()
    return onChatsChanged(reload)
  }, [reload])

  const groups = useMemo(() => (chats ? groupChats(chats) : []), [chats, tr])
  const activeChat = pathname.startsWith('/chat/') ? Number(pathname.split('/')[2]) : null

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
    <Animated.View
      style={[
        styles.root,
        rootStyle,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 8 },
      ]}
    >
      <Pressable
        onPress={toggle}
        hitSlop={6}
        style={styles.toggle}
        accessibilityLabel={t(collapsed ? 'sidebar.expand' : 'sidebar.collapse')}
      >
        <Ionicons name="menu-outline" size={22} color={colors.textMuted} />
      </Pressable>
      <View style={styles.nav}>
        {nav.map((item) => (
          <SidebarRow
            key={item.path}
            active={pathname === item.path}
            onPress={() => router.navigate(item.href as never)}
          >
            <Ionicons name={item.icon} size={18} color={colors.textMuted} />
            <Animated.Text numberOfLines={1} style={[styles.navLabel, fade]}>
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
                onPress={() => router.navigate(`/chat/${chat.id}` as never)}
                onMenu={() => openMenu(chat)}
              >
                <Avatar name={chat.ownerName} file={chat.ownerAvatar} size={26} viewable={false} />
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
        <SidebarRow active={pathname === '/settings'} onPress={() => router.navigate('/settings' as never)}>
          <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
          <Animated.Text numberOfLines={1} style={[styles.navLabel, fade]}>
            {t('settings.title')}
          </Animated.Text>
        </SidebarRow>
      </View>
    </Animated.View>
  )
}

type RowProps = {
  active: boolean
  onPress: () => void
  // Shows the "..." button while the pointer is over the row.
  onMenu?: () => void
  children: React.ReactNode
}

function SidebarRow({ active, onPress, onMenu, children }: RowProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const [hovered, setHovered] = useState(false)
  // The hover sits on a wrapper that holds the row and the "..." button side by side. With
  // the button inside the row, pointing at it counted as leaving the row, and it vanished.
  // mouseenter and mouseleave do not fire for the children, so the wrapper keeps it.
  const hover = { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
  return (
    <View {...hover}>
      <Pressable
        onPress={onPress}
        // Like the cards of the lists: the chosen row is a card with an outline, a hovered
        // one shows just the outline, and a press sinks it a little.
        style={({ pressed }) => [
          styles.row,
          onMenu && styles.rowWithMenu,
          hovered && { borderColor: colors.border },
          active && { backgroundColor: colors.surface, borderColor: colors.borderStrong },
          pressed && { transform: [{ scale: 0.985 }] },
        ]}
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
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
      overflow: 'hidden',
      backgroundColor: colors.bg,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
      paddingHorizontal: 8,
    },
    toggle: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    nav: { gap: 2, paddingBottom: 8 },
    list: { flex: 1 },
    listContent: { paddingBottom: 8 },
    footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: 'transparent' },
    navLabel: { flex: 1, color: colors.text, fontSize: 15 },
    group: { color: colors.textFaint, fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingTop: 14, paddingBottom: 4 },
    empty: { color: colors.textFaint, fontSize: 14, padding: 12 },
    chatText: { flex: 1 },
    chatTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 15 },
    chatOwner: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
    rowWithMenu: { paddingRight: 36 },
    more: { position: 'absolute', right: 8, top: 0, bottom: 0, width: 24, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  })
