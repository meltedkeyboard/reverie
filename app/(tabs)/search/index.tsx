import type Ionicons from '@expo/vector-icons/Ionicons'
import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native'
import type { SearchBarCommands } from 'react-native-screens'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/Avatar'
import { AvatarStack } from '@/components/AvatarStack'
import { EmptyState } from '@/components/EmptyState'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/GlassHeader'
import { SFIcon } from '@/components/SFIcon'
import { listCharacters, type CharacterPreview } from '@/db/characters'
import { useDatabase } from '@/db/provider'
import { listRooms, type RoomPreview } from '@/db/rooms'
import { listSearchChats, searchMessages, type SearchChat, type SearchMessage } from '@/db/search'
import { useTranslation } from '@/i18n'
import { cloudSyncAvailable } from '@/lib/cloudSync'
import { formatWhen } from '@/lib/format'
import { characterPreview } from '@/lib/roleplay'
import { getSearchScope, type SearchScope, type SettingsSection } from '@/lib/searchScope'
import { useColors, useStyles, type Colors } from '@/theme'

type SettingEntry = {
  label: string
  // Other words the entry is found by: its options and the fields inside it.
  keywords: string[]
  symbol: React.ComponentProps<typeof SFIcon>['name']
  fallback: React.ComponentProps<typeof Ionicons>['name']
  href: Href
  danger?: boolean
}

type Item =
  | { kind: 'character'; key: string; character: CharacterPreview }
  | { kind: 'room'; key: string; room: RoomPreview }
  | { kind: 'chat'; key: string; chat: SearchChat }
  | { kind: 'message'; key: string; message: SearchMessage }
  | { kind: 'setting'; key: string; setting: SettingEntry }

type SectionKey = 'characters' | 'rooms' | 'chats' | 'messages' | 'settings'
type Section = { key: SectionKey | 'recent'; title: string; data: Item[] }

// What leads depends on the tab search was opened from.
const ORDER: Record<SearchScope, SectionKey[]> = {
  characters: ['characters', 'chats', 'messages', 'rooms', 'settings'],
  rooms: ['rooms', 'chats', 'messages', 'characters', 'settings'],
  settings: ['settings', 'characters', 'rooms', 'chats', 'messages'],
}

const settingsAt = (section: SettingsSection): Href => ({ pathname: '/settings', params: { section } })

const RECENT_COUNT = 6
// A single letter is found in nearly every message, so the text is searched from two.
const MESSAGE_MIN_LENGTH = 2

type Loaded = { characters: CharacterPreview[]; rooms: RoomPreview[]; chats: SearchChat[] }

export default function SearchScreen() {
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const webPadding = useScreenPadding('list')
  const { t, locale } = useTranslation()
  const searchBar = useRef<SearchBarCommands>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<SearchScope>(getSearchScope)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [messages, setMessages] = useState<SearchMessage[]>([])

  const trimmed = query.trim()
  const needle = trimmed.toLocaleLowerCase()

  useFocusEffect(
    useCallback(() => {
      setScope(getSearchScope())
      ;(async () => {
        setLoaded({ characters: await listCharacters(db), rooms: await listRooms(db), chats: await listSearchChats(db) })
      })()
      // Opening search is asking to type, as with Spotlight.
      const timer = setTimeout(() => searchBar.current?.focus(), 250)
      return () => clearTimeout(timer)
    }, [db])
  )

  // The only query that reads the whole history, so it waits for a pause in typing and
  // drops what arrives for an older query.
  useEffect(() => {
    if (trimmed.length < MESSAGE_MIN_LENGTH) {
      setMessages([])
      return
    }
    let stale = false
    const timer = setTimeout(async () => {
      const found = await searchMessages(db, trimmed)
      if (!stale) setMessages(found)
    }, 150)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [db, trimmed])

  const settings = useMemo<SettingEntry[]>(() => {
    const entries: SettingEntry[] = [
      { label: t('settings.appearance'), keywords: [t('theme.light'), t('theme.dark')], symbol: 'paintbrush', fallback: 'color-palette-outline', href: settingsAt('appearance') },
      { label: t('settings.language'), keywords: [t('language.ru'), t('language.en')], symbol: 'globe', fallback: 'globe-outline', href: settingsAt('language') },
      { label: t('settings.continueButton'), keywords: [t('settings.homeScreen')], symbol: 'play.circle', fallback: 'play-circle-outline', href: settingsAt('continue') },
      { label: t('settings.privateButton'), keywords: [t('settings.chats')], symbol: 'eye', fallback: 'eye-outline', href: settingsAt('private') },
      { label: t('settings.confirmDelete'), keywords: [t('settings.chats')], symbol: 'trash', fallback: 'trash-outline', href: settingsAt('confirmDelete') },
      { label: t('settings.haptics'), keywords: [t('settings.feedback')], symbol: 'iphone.radiowaves.left.and.right', fallback: 'phone-portrait-outline', href: settingsAt('haptics') },
      {
        label: t('settings.server'),
        keywords: [t('settings.baseUrlLabel'), t('settings.apiKeyLabel'), t('settings.modelLabel'), t('settings.testConnection')],
        symbol: 'server.rack',
        fallback: 'server-outline',
        href: settingsAt('server'),
      },
      { label: t('settings.backupTitle'), keywords: [t('settings.exportJson'), t('settings.importJson')], symbol: 'externaldrive', fallback: 'archive-outline', href: settingsAt('backup') },
      { label: t('settings.aboutReverie'), keywords: [t('settings.aboutTitle')], symbol: 'info.circle', fallback: 'information-circle-outline', href: '/about' },
      { label: t('settings.wipeAll'), keywords: [t('settings.dangerZone')], symbol: 'exclamationmark.triangle', fallback: 'warning-outline', href: settingsAt('wipe'), danger: true },
    ]
    if (Platform.OS !== 'web') {
      entries.splice(
        6,
        0,
        { label: t('settings.requireFaceId'), keywords: [t('settings.security')], symbol: 'faceid', fallback: 'scan-outline', href: settingsAt('faceId') },
        { label: t('settings.showInFiles'), keywords: [t('settings.security')], symbol: 'folder', fallback: 'folder-outline', href: settingsAt('files') }
      )
    }
    if (cloudSyncAvailable) {
      const backup = entries.findIndex((entry) => entry.label === t('settings.backupTitle'))
      entries.splice(backup, 0, { label: t('settings.icloud'), keywords: [t('settings.icloudSync'), 'iCloud'], symbol: 'icloud', fallback: 'cloud-outline', href: settingsAt('icloud') })
    }
    return entries
  }, [t])

  const sections = useMemo<Section[]>(() => {
    if (!loaded) return []
    if (!needle) {
      const recent = loaded.chats.slice(0, RECENT_COUNT)
      return recent.length
        ? [{ key: 'recent', title: t('search.recent'), data: recent.map((chat) => ({ kind: 'chat', key: `chat${chat.id}`, chat })) }]
        : []
    }

    const has = (text: string | null | undefined) => Boolean(text && text.toLocaleLowerCase().includes(needle))
    const starts = (text: string) => text.toLocaleLowerCase().startsWith(needle)
    // Names that begin with the query come before those that only contain it.
    const byPrefix = <T,>(items: T[], name: (item: T) => string) =>
      [...items].sort((a, b) => Number(starts(name(b))) - Number(starts(name(a))))
    // Within chats and messages, the ones of the tab search came from go first.
    const scopeFirst = <T extends { roomId: number | null },>(items: T[]) =>
      scope === 'rooms' ? [...items].sort((a, b) => Number(b.roomId !== null) - Number(a.roomId !== null)) : items

    const found: Record<SectionKey, Section> = {
      characters: {
        key: 'characters',
        title: t('characters.title'),
        data: byPrefix(loaded.characters.filter((c) => has(c.name)), (c) => c.name).map((character) => ({
          kind: 'character',
          key: `character${character.id}`,
          character,
        })),
      },
      rooms: {
        key: 'rooms',
        title: t('rooms.title'),
        data: byPrefix(
          loaded.rooms.filter((r) => has(r.name) || r.cast.some((m) => has(m.name))),
          (r) => r.name
        ).map((room) => ({ kind: 'room', key: `room${room.id}`, room })),
      },
      chats: {
        key: 'chats',
        title: t('search.chats'),
        data: scopeFirst(loaded.chats.filter((c) => has(c.title))).map((chat) => ({ kind: 'chat', key: `chat${chat.id}`, chat })),
      },
      messages: {
        key: 'messages',
        title: t('search.messages'),
        data: scopeFirst(messages).map((message) => ({ kind: 'message', key: `message${message.id}`, message })),
      },
      settings: {
        key: 'settings',
        title: t('settings.title'),
        data: settings
          .filter((s) => has(s.label) || s.keywords.some(has))
          .map((setting) => ({ kind: 'setting', key: `setting${setting.label}`, setting })),
      },
    }
    return ORDER[scope].map((key) => found[key]).filter((section) => section.data.length > 0)
  }, [loaded, needle, messages, settings, scope, t])

  const open = (item: Item) => {
    if (item.kind === 'character') router.push(`/chats/${item.character.id}`)
    else if (item.kind === 'room') router.push(`/rooms/${item.room.id}`)
    else if (item.kind === 'chat') router.push(`/chat/${item.chat.id}`)
    else if (item.kind === 'message') router.push(`/chat/${item.message.chatId}?message=${item.message.id}`)
    else router.navigate(item.setting.href)
  }

  const placeholder =
    scope === 'rooms' ? t('search.placeholderRooms') : scope === 'settings' ? t('search.placeholderSettings') : t('search.placeholderCharacters')

  const renderItem = ({ item }: { item: Item }) => (
    <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <ResultRow item={item} needle={needle} locale={locale} you={t('search.you')} />
    </Pressable>
  )

  const empty = loaded ? (
    needle ? (
      <EmptyState title={t('search.noResultsTitle')} text={t('search.noResultsText')} />
    ) : (
      <EmptyState title={t('search.emptyTitle')} text={t('search.emptyText')} />
    )
  ) : null

  const list = (contentStyle: object, header?: React.ReactElement) => (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={[styles.content, contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    />
  )

  // The web has no native search bar: the field is the first thing in the list, under
  // the same drawn header as the other tabs.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        {list(
          webPadding,
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            autoFocus
            autoCorrect={false}
            style={styles.webField}
          />
        )}
        <GlassHeader floating>
          <TabTitle>{t('search.title')}</TabTitle>
        </GlassHeader>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerShown: true,
          // iOS draws the scroll edge effect under a transparent bar; Android gets a plain one.
          headerTransparent: Platform.OS === 'ios',
          headerStyle: Platform.OS === 'ios' ? undefined : { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTitleAlign: 'left',
          headerTitle: () => <TabTitle>{t('search.title')}</TabTitle>,
          headerSearchBarOptions: {
            ref: searchBar,
            placeholder,
            autoCapitalize: 'none',
            hideWhenScrolling: false,
            obscureBackground: false,
            tintColor: colors.accent,
            textColor: colors.text,
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />
      {list({ paddingBottom: Platform.OS === 'ios' ? 24 : insets.bottom + 24 })}
    </View>
  )
}

type RowProps = { item: Item; needle: string; locale: ReturnType<typeof useTranslation>['locale']; you: string }

function ResultRow({ item, needle, locale, you }: RowProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)

  if (item.kind === 'character') {
    const { character } = item
    return (
      <>
        <Avatar name={character.name} file={character.avatar} size={40} />
        <View style={styles.body}>
          <Highlighted text={character.name} needle={needle} style={styles.title} />
          <Text style={styles.subtitle} numberOfLines={1}>
            {characterPreview(character)}
          </Text>
        </View>
      </>
    )
  }

  if (item.kind === 'room') {
    const { room } = item
    return (
      <>
        <View style={styles.leading}>
          <AvatarStack cast={room.cast} size={28} max={2} />
        </View>
        <View style={styles.body}>
          <Highlighted text={room.name} needle={needle} style={styles.title} />
          <Highlighted text={room.cast.map((m) => m.name).join(', ')} needle={needle} style={styles.subtitle} />
        </View>
      </>
    )
  }

  if (item.kind === 'chat') {
    const { chat } = item
    const when = formatWhen(chat.lastActivity, locale)
    return (
      <>
        <Avatar name={chat.ownerName} file={chat.ownerAvatar} size={40} />
        <View style={styles.body}>
          <Highlighted text={chat.title ?? when} needle={needle} style={styles.title} />
          <Text style={styles.subtitle} numberOfLines={1}>
            {chat.title ? `${chat.ownerName} · ${when}` : chat.ownerName}
          </Text>
        </View>
      </>
    )
  }

  if (item.kind === 'message') {
    const { message } = item
    const author = message.speakerName ?? you
    const context = message.chatTitle ? `${message.ownerName} · ${message.chatTitle}` : message.ownerName
    return (
      <>
        <Avatar
          name={message.speakerName ?? message.ownerName}
          file={message.speakerName ? message.speakerAvatar : message.ownerAvatar}
          size={40}
        />
        <View style={styles.body}>
          <View style={styles.titleLine}>
            <Text style={[styles.title, styles.flexText]} numberOfLines={1}>
              {author === message.ownerName ? context : `${author} → ${context}`}
            </Text>
            <Text style={styles.meta}>{formatWhen(message.createdAt, locale)}</Text>
          </View>
          <Highlighted text={snippet(message.content, needle)} needle={needle} style={styles.snippet} lines={2} />
        </View>
      </>
    )
  }

  const { setting } = item
  return (
    <>
      <View style={[styles.tile, { backgroundColor: setting.danger ? colors.danger : colors.accent }]}>
        <SFIcon name={setting.symbol} fallback={setting.fallback} size={17} color="#FFFFFF" />
      </View>
      <View style={styles.body}>
        <Highlighted text={setting.label} needle={needle} style={styles.title} />
      </View>
      <SFIcon name="chevron.right" fallback="chevron-forward" size={14} color={colors.textFaint} />
    </>
  )
}

// The found part of the text in the accent color.
function Highlighted({ text, needle, style, lines = 1 }: { text: string; needle: string; style: StyleProp<TextStyle>; lines?: number }) {
  const styles = useStyles(createStyles)
  const at = needle ? text.toLocaleLowerCase().indexOf(needle) : -1
  return (
    <Text style={style} numberOfLines={lines}>
      {at === -1 ? (
        text
      ) : (
        <>
          {text.slice(0, at)}
          <Text style={styles.hit}>{text.slice(at, at + needle.length)}</Text>
          {text.slice(at + needle.length)}
        </>
      )}
    </Text>
  )
}

const SNIPPET_LEAD = 40

// A message found in its middle is cut to start shortly before the match, so the match
// shows within the two lines.
function snippet(content: string, needle: string) {
  const text = content.replace(/\s+/g, ' ').trim()
  const at = text.toLocaleLowerCase().indexOf(needle)
  if (at <= SNIPPET_LEAD) return text
  const from = text.lastIndexOf(' ', at - SNIPPET_LEAD / 2)
  return '…' + text.slice(from > 0 ? from + 1 : at - SNIPPET_LEAD / 2)
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { flexGrow: 1, paddingHorizontal: 16 },
    webField: {
      height: 44,
      borderRadius: 22,
      paddingHorizontal: 18,
      marginBottom: 8,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    section: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 18,
      marginBottom: 6,
      marginHorizontal: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 14 },
    rowPressed: { backgroundColor: colors.accentSoft },
    leading: { width: 40, alignItems: 'flex-start' },
    body: { flex: 1 },
    titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    flexText: { flex: 1 },
    title: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 2 },
    subtitle: { color: colors.textMuted, fontSize: 14 },
    snippet: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
    meta: { color: colors.textFaint, fontSize: 12 },
    hit: { color: colors.accent, fontWeight: '700' },
    tile: {
      width: 32,
      height: 32,
      marginHorizontal: 4,
      borderRadius: 8,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
