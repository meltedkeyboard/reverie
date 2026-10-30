import { Link, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ReorderableList from 'react-native-reorderable-list'

import { Avatar } from '@/components/visuals/Avatar'
import { Button } from '@/components/controls/Button'
import { IconButton } from '@/components/controls/IconButton'
import { EmptyState, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton, GlassGroup } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { ListCard } from '@/components/lists/ListCard'
import { NativeCardList, nativeCardList, type NativeCardRow } from '@/components/lists/NativeCardList'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { Pattern } from '@/components/visuals/Pattern'
import { deletePersona, listPersonas, setDefaultPersona, setPersonaOrder, type Persona } from '@/db/personas'
import { useDatabase } from '@/db/provider'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useEditMode } from '@/hooks/features/useEditMode'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { useColors, useStyles, type Colors } from '@/theme'
import { Star } from '@/components/visuals/motifs/Star'

// The personas, opened from Settings, as the Characters tab lists the characters: on iOS the
// system's list with the face, the name and the description under it, the swipes and edit
// mode; elsewhere cards. The default persona has a star after its name, and a swipe from the
// leading edge makes a persona the default or stops it being one.
export default function PersonasScreen() {
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [personas, setPersonas] = useState<Persona[] | null>(null)

  const reload = useCallback(async () => {
    setPersonas(await listPersonas(db))
  }, [db])

  useReloadOnFocus(reload)

  const reorder = useReorder(personas, setPersonas, (ids) => setPersonaOrder(db, ids))
  const { editing, setEditing, motion, button: editButton, checked, setChecked, toggleChecked } = useEditMode()
  const allChecked = !!personas?.length && checked.size === personas.length
  const native = !!nativeCardList && !!personas?.length
  const bottomSpace = editing ? EDIT_BAR_SPACE : 0

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

  const deleteChecked = () => {
    const doomed = (personas ?? []).filter((p) => checked.has(p.id))
    confirmDeletion({
      title: t('persona.deleteSelectedTitle', { count: doomed.length }),
      message: t('persona.deleteSelectedMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        for (const persona of doomed) await deletePersona(db, persona.id)
        setEditing(false)
        reload()
      },
    })
  }

  const toggleDefault = async (persona: Persona) => {
    await setDefaultPersona(db, persona.isDefault ? null : persona.id)
    reload()
  }
  const defaultAction = (persona: Persona) =>
    persona.isDefault
      ? { label: t('persona.clearDefault'), symbol: 'star.slash' }
      : { label: t('persona.makeDefault'), symbol: 'star' }

  const open = (persona: Persona) => router.push(`/persona/${persona.id}`)
  const menuOf = (persona: Persona): MenuItem[] => [
    { label: t('persona.edit'), systemImage: 'pencil', onSelect: () => open(persona) },
    { label: defaultAction(persona).label, systemImage: defaultAction(persona).symbol, onSelect: () => toggleDefault(persona) },
    { label: t('persona.delete'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(persona) },
  ]

  // A persona is nobody's to drag out or drop onto, so a long press is only its menu.
  const nativeRows: NativeCardRow[] = native
    ? (personas ?? []).map((persona) => ({
        key: String(persona.id),
        people: [persona],
        title: persona.name,
        mark: persona.isDefault ? 'star.fill' : undefined,
        date: null,
        line: persona.description.trim().replace(/\s+/g, ' ') || t('persona.noDescription'),
        menu: menuOf(persona),
        ids: [persona.id],
        drags: [],
        onOpen: () => open(persona),
        onDelete: () => confirmDelete(persona),
        leading: { label: defaultAction(persona).label, systemImage: defaultAction(persona).symbol, onAction: () => toggleDefault(persona) },
      }))
    : []

  return (
    <View style={styles.screen}>
      <Pattern id="two-stars" />
      {native ? (
        <NativeCardList
          rows={nativeRows}
          editing={editing}
          checked={checked}
          onCheck={setChecked}
          bottomInset={bottomSpace}
          onMove={(from, to) => reorder.onReorder({ from, to })}
        />
      ) : (
        <ReorderableList
          data={personas ?? []}
          keyExtractor={(p) => String(p.id)}
          {...reorder}
          scrollEnabled={Boolean(personas?.length)}
          contentContainerStyle={[padding, { paddingBottom: padding.paddingBottom + bottomSpace }]}
          ItemSeparatorComponent={ListSeparator}
          ListEmptyComponent={
            personas ? (
              <EmptyState
                title={t('persona.emptyTitle')}
                text={t('persona.emptyText')}
                action={
                  <Link href="/persona/new" asChild>
                    <Link.AppleZoom>
                      <Button variant="glass" label={t('persona.create')} style={emptyButtonStyle} />
                    </Link.AppleZoom>
                  </Link>
                }
              />
            ) : undefined
          }
          renderItem={({ item: persona }) => (
            <ListCard
              solid
              onOpen={() => open(persona)}
              onDelete={() => confirmDelete(persona)}
              menu={menuOf(persona)}
              editing={{ active: editing, checked: checked.has(persona.id), onToggle: () => toggleChecked([persona.id]), motion }}
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
          )}
        />
      )}
      {editing ? (
        <Animated.View
          entering={FadeInDown.springify().duration(350).dampingRatio(1)}
          exiting={FadeOutDown.duration(200)}
          style={[
            styles.editBar,
            {
              bottom: insets.bottom + 12,
              left: Math.max(16, insets.left + 8),
              right: Math.max(16, insets.right + 8),
            },
          ]}
          pointerEvents="box-none"
        >
          <Button
            variant="glass"
            label={allChecked ? t('characters.deselectAll') : t('characters.selectAll')}
            onPress={() => setChecked(allChecked ? new Set() : new Set((personas ?? []).map((p) => p.id)))}
          />
          <GlassButton
            icon="trash-outline"
            tint={checked.size ? colors.danger : undefined}
            disabled={!checked.size}
            onPress={deleteChecked}
            accessibilityLabel={t('persona.deleteSelected')}
          />
        </Animated.View>
      ) : null}
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
          // The edit and create buttons share one capsule, as on the Characters tab.
          <GlassGroup interactive={false}>
            {personas?.length ? (
              <IconButton
                name={editing ? 'checkmark' : 'list'}
                color={editing ? colors.accent : undefined}
                {...editButton}
                accessibilityLabel={editing ? t('characters.doneEditing') : t('characters.editList')}
              />
            ) : null}
            {editing ? null : (
              <IconButton name="add" size={26} onPress={() => router.push('/persona/new')} accessibilityLabel={t('persona.create')} />
            )}
          </GlassGroup>
        }
      >
        <TabTitle>{t('persona.title')}</TabTitle>
      </GlassHeader>
    </View>
  )
}

// Room the list leaves under its last row for the edit bar.
const EDIT_BAR_SPACE = 64

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    editBar: {
      position: 'absolute',
      maxWidth: 720,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
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
