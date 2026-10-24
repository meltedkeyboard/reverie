import { Icon } from '@/components/visuals/Icon'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated'

import { Avatar } from '@/components/visuals/Avatar'
import { GlassSurface } from '@/components/chrome/Glass'
import { PageSheet } from '@/components/overlays/PageSheet'
import type { CharacterPreview } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { countLabel } from '@/lib/core/format'
import * as Haptics from '@/lib/ui/haptics'
import { ON_ACCENT, useColors, useStyles, type Colors } from '@/theme'

type Props = {
  visible: boolean
  characters: CharacterPreview[]
  onConfirm: (ids: number[]) => void
  onClose: () => void
  // Who is ticked as it opens, for a list that is being changed rather than added to (the
  // cast of a room): then the confirm button also takes the list emptied or unchanged.
  initial?: number[]
  title?: string
  confirmLabel?: string
}

const SPRING = { damping: 28, stiffness: 320, mass: 0.8 }

function CheckMark({ state }: { state: 'all' | 'none' }) {
  const colors = useColors()
  const name = state === 'all' ? 'checkmark-circle' : 'ellipse-outline'
  return (
    <View style={{ width: 24, height: 24 }}>
      <Animated.View
        key={name}
        entering={ZoomIn.duration(160)}
        exiting={ZoomOut.duration(120)}
        style={{ position: 'absolute' }}
      >
        <Icon name={name} size={24} color={state === 'none' ? colors.textFaint : colors.accent} />
      </Animated.View>
    </View>
  )
}

function Ring({ state, children }: { state: 'all' | 'none'; children: React.ReactNode }) {
  const colors = useColors()
  const solid = useSharedValue(state === 'all' ? 1 : 0)
  const lit = useSharedValue(state === 'none' ? 0 : 1)
  const press = useSharedValue(1)

  useEffect(() => {
    solid.value = withSpring(state === 'all' ? 1 : 0, SPRING)
    lit.value = withTiming(state === 'none' ? 0 : 1, { duration: 200 })
    press.value = 0.96
    press.value = withSpring(1, SPRING)
  }, [state, solid, lit, press])

  const ringStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, solid.value)),
    transform: [{ scale: 1.15 - 0.15 * Math.min(1, Math.max(0, solid.value)) }],
  }))
  const pictureStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + 0.55 * lit.value,
    transform: [{ scale: press.value }],
  }))

  const ring = {
    position: 'absolute' as const,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: colors.accent,
  }
  return (
    <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[ring, ringStyle]} />
      <Animated.View style={pictureStyle}>{children}</Animated.View>
    </View>
  )
}

export function AddCharactersSheet({ visible, characters, onConfirm, onClose, initial, title, confirmLabel }: Props) {
  const { t, locale } = useTranslation()
  const colors = useColors()
  const styles = useStyles(createStyles)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (visible) {
      setSelected(new Set(initial))
      setSearch('')
    }
    // Read as it opens; a change of the list behind it while it is up stays out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return characters
    return characters.filter((c) => c.name.toLowerCase().includes(q))
  }, [characters, search])

  const allOn = filtered.length > 0 && filtered.every((c) => selected.has(c.id))

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    Haptics.selectionAsync()
    setSelected((prev) => {
      if (allOn) {
        const next = new Set(prev)
        for (const c of filtered) next.delete(c.id)
        return next
      }
      const next = new Set(prev)
      for (const c of filtered) next.add(c.id)
      return next
    })
  }

  const canConfirm = initial !== undefined || selected.size > 0

  const handleConfirm = () => {
    onConfirm(Array.from(selected))
  }

  return (
    <PageSheet
      visible={visible}
      onClose={onClose}
      title={title ?? t('groups.addCharacterTitle')}
      background={colors.bg}
      left={
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.action}>{t('common.cancel')}</Text>
        </Pressable>
      }
      right={
        <Pressable
          onPress={handleConfirm}
          disabled={!canConfirm}
          hitSlop={8}
          style={!canConfirm && { opacity: 0.4 }}
        >
          <GlassSurface
            interactive={canConfirm}
            tintColor={colors.accent}
            style={styles.confirm}
            fallbackStyle={{ backgroundColor: colors.accent }}
          >
            <Text style={styles.confirmLabel}>
              {confirmLabel ?? (selected.size > 0 ? `${t('groups.addCharacter')} (${selected.size})` : t('groups.addCharacter'))}
            </Text>
          </GlassSurface>
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {characters.length > 0 ? (
          <>
            {characters.length > 4 ? (
              <View style={styles.searchBar}>
                <Icon name="search" size={16} color={colors.textFaint} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('search.title')}
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.accent}
                  style={styles.searchInput}
                  clearButtonMode="while-editing"
                />
              </View>
            ) : null}

            <View style={styles.topRow}>
              <Pressable onPress={toggleAll} hitSlop={8} style={{ height: 24 }}>
                <Animated.Text
                  key={allOn ? 'clear' : 'select'}
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(120)}
                  style={styles.action}
                >
                  {allOn ? t('backup.clearAll') : t('backup.selectAll')}
                </Animated.Text>
              </Pressable>
              {selected.size > 0 ? (
                <Text style={styles.selectedCount}>
                  {t('backup.selected', { selected: selected.size, total: characters.length })}
                </Text>
              ) : null}
            </View>

            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t('search.noResultsTitle')}</Text>
                <Text style={styles.emptyText}>{t('search.noResultsText')}</Text>
              </View>
            ) : (
              filtered.map((character) => {
                const isSelected = selected.has(character.id)
                return (
                  <Animated.View key={character.id} layout={LinearTransition.duration(200)}>
                    <Pressable
                      style={styles.nodeRow}
                      onPress={() => {
                        Haptics.selectionAsync()
                        toggle(character.id)
                      }}
                    >
                      <View style={styles.ringHit}>
                        <Ring state={isSelected ? 'all' : 'none'}>
                          <Avatar name={character.name} file={character.avatar} size={40} viewable={false} />
                        </Ring>
                      </View>
                      <View style={styles.rowMain}>
                        <Text style={styles.name} numberOfLines={1}>
                          {character.name}
                        </Text>
                        {character.chatCount ? (
                          <Text style={styles.count}>{countLabel(character.chatCount, 'chat', locale)}</Text>
                        ) : null}
                        <CheckMark state={isSelected ? 'all' : 'none'} />
                      </View>
                    </Pressable>
                  </Animated.View>
                )
              })
            )}
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('groups.noCharactersToAddTitle')}</Text>
            <Text style={styles.emptyText}>{t('groups.noCharactersToAddMessage')}</Text>
          </View>
        )}
      </ScrollView>
    </PageSheet>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    list: { padding: 20, gap: 4 },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 28,
      marginBottom: 6,
    },
    selectedCount: { color: colors.textFaint, fontSize: 13 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 15, padding: 0 },
    nodeRow: { flexDirection: 'row', alignItems: 'center' },
    ringHit: { justifyContent: 'center', paddingVertical: 8, paddingLeft: 4, paddingRight: 14 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
    count: { color: colors.textFaint, fontSize: 13 },
    action: { color: colors.accent, fontSize: 17 },
    confirm: { minHeight: 36, paddingHorizontal: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    confirmLabel: { color: ON_ACCENT, fontSize: 16, fontWeight: '600' },
    empty: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center', gap: 8 },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
    emptyText: { color: colors.textFaint, fontSize: 14, textAlign: 'center' },
  })
