import { Link, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/controls/Button'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { EmptyState, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { ListCard } from '@/components/lists/ListCard'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { Icon } from '@/components/visuals/Icon'
import { Pattern } from '@/components/visuals/Pattern'
import { deleteLorebook, listLorebooks, type LorebookPreview } from '@/db/lorebooks'
import { useDatabase } from '@/db/provider'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useTranslation } from '@/i18n'
import { countLabel } from '@/lib/core/format'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { useColors, useStyles, type Colors } from '@/theme'

// The lorebooks, opened from Settings: each with how many entries it has and who uses it.
export default function LorebooksScreen() {
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const [books, setBooks] = useState<LorebookPreview[] | null>(null)

  const reload = useCallback(async () => setBooks(await listLorebooks(db)), [db])
  useReloadOnFocus(reload)

  const confirmDelete = (book: LorebookPreview) => {
    confirmDeletion({
      title: t('lore.delete'),
      message: t('lore.deleteConfirm', { name: book.name }),
      onConfirm: async () => {
        await deleteLorebook(db, book.id)
        reload()
      },
    })
  }

  return (
    <View style={styles.screen}>
      <Pattern id="two-stars" />
      <FlatList
        data={books ?? []}
        keyExtractor={(book) => String(book.id)}
        scrollEnabled={Boolean(books?.length)}
        contentContainerStyle={padding}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          books ? (
            <EmptyState
              title={t('lore.emptyTitle')}
              text={t('lore.emptyText')}
              action={
                <Link href="/lorebook/new" asChild>
                  <Link.AppleZoom>
                    <Button variant="glass" label={t('lore.create')} style={emptyButtonStyle} />
                  </Link.AppleZoom>
                </Link>
              }
            />
          ) : undefined
        }
        renderItem={({ item: book }) => {
          const menu: MenuItem[] = [
            { label: t('lore.edit'), systemImage: 'pencil', onSelect: () => router.push(`/lorebook/${book.id}`) },
            { label: t('lore.delete'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(book) },
          ]
          return (
            <ListCard onOpen={() => router.push(`/lorebook/${book.id}`)} onDelete={() => confirmDelete(book)} menu={menu}>
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Icon name="book-outline" size={22} color={colors.accent} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {book.name || t('lore.untitled')}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {[countLabel(book.entryCount, 'entry', locale), book.owners.length ? book.owners.join(', ') : t('lore.unused')].join(' · ')}
                  </Text>
                </View>
              </View>
            </ListCard>
          )
        }}
      />
      <GlassHeader
        floating
        centerTitle
        left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        right={
          <Link href="/lorebook/new" asChild>
            <GlassButton icon="add" iconSize={26} accessibilityLabel={t('lore.create')} />
          </Link>
        }
      >
        <TabTitle>{t('lore.title')}</TabTitle>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
    },
    info: { flex: 1, gap: 2 },
    name: { fontSize: 16, fontWeight: '600', color: colors.text },
    meta: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  })
