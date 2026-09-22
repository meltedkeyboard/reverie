import { Link, usePathname, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { deleteCharacter, listCharacters, type CharacterPreview } from '@/db/characters'
import { createChat, pruneUntouchedChats } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { confirm, showSheet } from '@/lib/dialogs'
import { plainPreview } from '@/lib/roleplay'
import { removeAvatar } from '@/lib/avatars'
import { fonts, useColors } from '@/theme'

import { Avatar } from './Avatar'
import { IconButton } from './IconButton'

// Persistent character rail shown next to the routed Stack on wide web viewports, so
// switching characters doesn't cost a round trip back to the root route. It mirrors
// CharacterCard's data and actions rather than the screen itself, which stays the
// phone layout used on narrow web and native.
export function Sidebar() {
  const db = useSQLiteContext()
  const router = useRouter()
  const pathname = usePathname()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
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

  const startChat = async (character: CharacterPreview) => {
    setActiveId(character.id)
    router.push(`/chat/${await createChat(db, character)}`)
  }

  const openMenu = (character: CharacterPreview) => {
    showSheet(character.name, [
      { label: t('characters.newChat'), onSelect: () => startChat(character) },
      { label: t('characters.edit'), onSelect: () => router.push(`/character/${character.id}`) },
      { label: t('characters.delete'), destructive: true, onSelect: () => confirmDelete(character) },
    ])
  }

  const confirmDelete = (character: CharacterPreview) => {
    confirm({
      title: t('characters.deleteConfirmTitle'),
      message: t('characters.deleteConfirmMessage', { name: character.name }),
      confirmLabel: t('characters.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteCharacter(db, character.id)
        if (character.avatar) removeAvatar(character.avatar)
        reload()
      },
    })
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('characters.title')}</Text>
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
        renderItem={({ item: character }) => {
          const active = character.id === activeId
          const preview = plainPreview(character.lastMessage ?? character.systemPrompt) || t('characterCard.noDescription')
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
                  {preview}
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

const createStyles = (colors: ReturnType<typeof useColors>) =>
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
    title: { color: colors.text, fontFamily: fonts.prose, fontSize: 20, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, marginBottom: 2 },
    rowActive: { backgroundColor: colors.accentSoft },
    rowBody: { flex: 1 },
    name: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
    preview: { color: colors.textMuted, fontSize: 13 },
    empty: { padding: 24, alignItems: 'center' },
    emptyText: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
  })
