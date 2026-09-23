import { Link, usePathname, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { listCharacters, type CharacterPreview } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { useCharacterActions } from '@/hooks/useCharacterActions'
import { useTranslation } from '@/i18n'
import { characterPreview } from '@/lib/roleplay'
import { useStyles, type Colors } from '@/theme'

import { Avatar } from './Avatar'
import { IconButton } from './IconButton'
import { Wordmark } from './Wordmark'

// Persistent character rail shown next to the routed Stack on wide web viewports, so
// switching characters doesn't cost a round trip back to the root route. It mirrors
// CharacterCard's data and actions rather than the screen itself, which stays the
// phone layout used on narrow web and native.
export function Sidebar() {
  const db = useSQLiteContext()
  const router = useRouter()
  const pathname = usePathname()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)

  const reload = useCallback(async () => {
    await pruneUntouchedChats(db)
    setCharacters(await listCharacters(db))
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
  useEffect(() => {
    const match = pathname.match(/^\/(chats|character)\/(\d+)/)
    if (match) setActiveId(Number(match[2]))
  }, [pathname])

  const { openMenu } = useCharacterActions(reload, (character) => setActiveId(character.id))

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Wordmark width={120} />
        <View style={styles.headerActions}>
          <IconButton name="settings-outline" size={20} onPress={() => router.push('/settings')} />
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
    empty: { padding: 24, alignItems: 'center' },
    emptyText: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
  })
