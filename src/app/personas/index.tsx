import { Link, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ReorderableList from 'react-native-reorderable-list'

import { Avatar } from '@/components/visuals/Avatar'
import { Button } from '@/components/controls/Button'
import { EmptyState, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { ListCard } from '@/components/lists/ListCard'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { Pattern } from '@/components/visuals/Pattern'
import { deletePersona, listPersonas, type Persona } from '@/db/personas'
import { useDatabase } from '@/db/provider'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useTranslation } from '@/i18n'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { useColors, useStyles, type Colors } from '@/theme'
import { Star } from '@/components/visuals/motifs/Star'

export default function PersonasScreen() {
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [personas, setPersonas] = useState<Persona[] | null>(null)

  const reload = useCallback(async () => {
    const list = await listPersonas(db)
    setPersonas(list)
  }, [db])

  useReloadOnFocus(reload)

  const confirmDelete = (persona: Persona) => {
    confirmDeletion({
      title: t('persona.delete'),
      message: t('persona.deleteConfirm', { name: persona.name }),
      confirmLabel: t('persona.delete'),
      destructive: true,
      onConfirm: async () => {
        await deletePersona(db, persona.id)
        reload()
      },
    })
  }

  return (
    <View style={styles.screen}>
      <Pattern id="two-stars" />
      <ReorderableList
        data={personas ?? []}
        keyExtractor={(p) => String(p.id)}
        onReorder={({ from, to }) => {
          setPersonas((prev) => {
            if (!prev) return null
            const next = [...prev]
            const [item] = next.splice(from, 1)
            next.splice(to, 0, item)
            return next
          })
        }}
        scrollEnabled={Boolean(personas?.length)}
        contentContainerStyle={padding}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          personas ? (
            <EmptyState
              title={t('persona.emptyTitle')}
              text={t('persona.emptyText')}
              action={
                <Link href="/persona/new" asChild>
                  <Button variant="glass" label={t('persona.create')} style={emptyButtonStyle} />
                </Link>
              }
            />
          ) : undefined
        }
        renderItem={({ item: persona }) => {
          const menu: MenuItem[] = [
            {
              label: t('persona.edit'),
              systemImage: 'pencil',
              onSelect: () => router.push(`/persona/${persona.id}`),
            },
            {
              label: t('persona.delete'),
              systemImage: 'trash',
              destructive: true,
              onSelect: () => confirmDelete(persona),
            },
          ]
          return (
            <ListCard
              onOpen={() => router.push(`/persona/${persona.id}`)}
              onDelete={() => confirmDelete(persona)}
              menu={menu}
            >
              <View style={styles.cardRow}>
                <Avatar name={persona.name} file={persona.avatar} size={44} />
                <View style={styles.cardInfo}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {persona.name}
                    </Text>
                    {persona.isDefault ? (
                      <View style={styles.defaultBadge}>
                        <Star size={11} color={colors.accent} />
                        <Text style={styles.defaultBadgeText}>{t('persona.defaultLabel')}</Text>
                      </View>
                    ) : null}
                  </View>
                  {persona.description ? (
                    <Text style={styles.cardDescription} numberOfLines={2}>
                      {persona.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            </ListCard>
          )
        }}
      />
      <GlassHeader
        floating
        centerTitle
        left={
          <GlassButton
            icon="chevron-back"
            iconSize={26}
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
          />
        }
        right={
          <Link href="/persona/new" asChild>
            <GlassButton icon="add" iconSize={26} accessibilityLabel={t('persona.create')} />
          </Link>
        }
      >
        <TabTitle>{t('persona.title')}</TabTitle>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      flex: 1,
    },
    cardInfo: {
      flex: 1,
      justifyContent: 'center',
      gap: 2,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flexShrink: 1,
    },
    defaultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: colors.surfaceRaised,
    },
    defaultBadgeText: {
      fontSize: 11,
      color: colors.accent,
      fontWeight: '600',
    },
    cardDescription: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
  })
