import { Link, usePathname, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { listCharacters, type CharacterPreview } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { listRooms, type RoomPreview } from '@/db/rooms'
import { useCharacterActions } from '@/hooks/useCharacterActions'
import { useTranslation } from '@/i18n'
import { characterPreview } from '@/lib/roleplay'
import { useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { AvatarStack } from './AvatarStack'
import { IconButton } from './IconButton'
import { Wordmark } from './Wordmark'

// Persistent character rail shown next to the routed Stack on wide web viewports, so
// switching characters doesn't cost a round trip back to the root route. It mirrors
// CharacterCard's data and actions rather than the screen itself, which stays the
// phone layout used on narrow web and native.
export function Sidebar() {
  const db = useDatabase()
  const router = useRouter()
  const pathname = usePathname()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)
  const [rooms, setRooms] = useState<RoomPreview[]>([])

  const reload = useCallback(async () => {
    await pruneUntouchedChats(db)
    setCharacters(await listCharacters(db))
    setRooms(await listRooms(db))
  }, [db])

  // Re-listed on every route change (not just on mount) so creating, editing, deleting
  // a character, or starting a chat from within the routed pane is reflected without a
  // dedicated event bus between the two.
  useEffect(() => {
    reload()
  }, [reload, pathname])

  // /chat/:id carries a chat id, not a character id, so the highlight is remembered
  // from the last /chats/:id or /character/:id visit instead of derived from the path.
  const [activeId, setActiveId] = useState<number | null>(null)
  const [activeRoom, setActiveRoom] = useState<number | null>(null)
  useEffect(() => {
    const match = pathname.match(/^\/(chats|character)\/(\d+)/)
    if (match) {
      setActiveId(Number(match[2]))
      setActiveRoom(null)
    }
    const room = pathname.match(/^\/rooms?\/(\d+)/)
    if (room) {
      setActiveRoom(Number(room[1]))
      setActiveId(null)
    }
  }, [pathname])

  const { openMenu } = useCharacterActions(reload, (character) => setActiveId(character.id))

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Wordmark width={120} />
        <View style={styles.headerActions}>
          <IconButton name="search" size={20} onPress={() => router.navigate('/search')} />
          <IconButton name="settings-outline" size={20} onPress={() => router.navigate('/settings')} />
          <Link href="/character/new" asChild>
            <IconButton name="add" size={22} />
          </Link>
        </View>
      </View>
      <FlatList
        data={characters ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: 8, paddingBottom: 16 }}
        ListHeaderComponent={<Text style={styles.section}>{t('characters.title')}</Text>}
        renderItem={({ item: character }) => {
          const active = character.id === activeId
          return (
            <Pressable
              onPress={() => {
                setActiveId(character.id)
                router.push(`/chats/${character.id}`)
              }}
              onLongPress={() => openMenu(character)}
              style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.75 }]}
            >
              <Avatar name={character.name} file={character.avatar} size={44} />
              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {character.name}
                </Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {characterPreview(character)}
                </Text>
              </View>
            </Pressable>
          )
        }}
        ListFooterComponent={
          <>
            <View style={styles.sectionRow}>
              <Text style={[styles.section, styles.sectionInRow]}>{t('rooms.title')}</Text>
              <Link href="/room/new" asChild>
                <IconButton name="add" size={18} />
              </Link>
            </View>
            {rooms.map((room) => (
              <Pressable
                key={room.id}
                onPress={() => {
                  setActiveRoom(room.id)
                  setActiveId(null)
                  router.push(`/rooms/${room.id}`)
                }}
                style={({ pressed }) => [styles.row, room.id === activeRoom && styles.rowActive, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.stack}>
                  <AvatarStack cast={room.cast} size={30} max={2} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {room.name}
                  </Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {room.cast.map((m) => m.name).join(', ')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        }
        ListEmptyComponent={
          characters && characters.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('characters.emptyTitle')}</Text>
            </View>
          ) : null
        }
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { width: 320, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 60,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    section: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 8,
      marginBottom: 6,
      marginHorizontal: 10,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, marginBottom: 2 },
    rowActive: { backgroundColor: colors.accentSoft },
    rowBody: { flex: 1 },
    name: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
    preview: { color: colors.textMuted, fontSize: 13 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginRight: 4 },
    sectionInRow: { marginTop: 0, marginBottom: 0 },
    stack: { width: 44, alignItems: 'flex-start' },
    empty: { padding: 24, alignItems: 'center' },
    emptyText: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
  })
