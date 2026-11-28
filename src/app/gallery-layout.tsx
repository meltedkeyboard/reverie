import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ProfileGallery } from '@/components/cast/ProfileGallery'
import { ListSection, MenuCell, SegmentCell, ValueCell } from '@/components/lists/GroupedList'
import { NativeHostedRow, NativePickerRow, NativeSection, NativeSegmentRow } from '@/components/lists/NativeForm'
import { SettingsSubpage } from '@/components/lists/SettingsSubpage'
import { SFIcon } from '@/components/visuals/SFIcon'
import { listCharacterGalleries, type CharacterGallery } from '@/db/gallery'
import { setGalleryLayout, useGalleryLayout, type GalleryLayout } from '@/db/prefs/galleryLook'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { selectionAsync } from '@/lib/ui/haptics'
import { useColors, useStyles, type Colors } from '@/theme'

export default function GalleryLayoutScreen() {
  const db = useDatabase()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const galleryLayout = useGalleryLayout()
  const [galleries, setGalleries] = useState<CharacterGallery[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      listCharacterGalleries(db)
        .then((list) => {
          if (!alive) return
          setGalleries(list)
          setLoaded(true)
        })
        .catch(() => {
          if (alive) setLoaded(true)
        })
      return () => {
        alive = false
      }
    }, [db])
  )

  const selected =
    galleries.find((g) => g.characterId === selectedId) ??
    galleries.find((g) => g.items.length > 1) ??
    galleries[0] ??
    null

  const layoutOptions: { value: GalleryLayout; label: string }[] = [
    { value: 'grid', label: t('settings.galleryGrid') },
    { value: 'carousel', label: t('settings.galleryCarousel') },
  ]

  const pickLayout = (next: GalleryLayout) => {
    selectionAsync()
    setGalleryLayout(db, next)
  }

  return (
    <SettingsSubpage
      title={t('settings.galleryLayout')}
      native={({ ui, modifiers }) => {
        const { LabeledContent, Text: SwiftText } = ui
        const { foregroundStyle } = modifiers
        return (
          <>
            {loaded && selected ? (
              <NativeSection title={t('gallery.title')}>
                <NativeHostedRow key={selected.characterId}>
                  <ProfileGallery
                    key={selected.characterId}
                    characterId={selected.characterId}
                    initialItems={selected.items}
                    readOnly
                    flush
                  />
                </NativeHostedRow>
                {galleries.length > 1 ? (
                  <NativePickerRow
                    label={t('settings.galleryPreviewCharacter')}
                    value={String(selected.characterId)}
                    options={galleries.map((g) => ({ value: String(g.characterId), label: g.name }))}
                    onChange={(next) => setSelectedId(Number(next))}
                  />
                ) : (
                  <LabeledContent label={t('settings.galleryPreviewCharacter')}>
                    <SwiftText>{selected.name}</SwiftText>
                  </LabeledContent>
                )}
              </NativeSection>
            ) : loaded ? (
              <NativeSection title={t('gallery.title')}>
                <SwiftText modifiers={[foregroundStyle(colors.textMuted)]}>{t('settings.galleryPreviewEmpty')}</SwiftText>
              </NativeSection>
            ) : null}

            <NativeSection footer={t('settings.galleryLayoutNote')}>
              <NativeSegmentRow
                label={t('settings.galleryLayout')}
                options={layoutOptions}
                value={galleryLayout}
                onChange={pickLayout}
              />
            </NativeSection>
          </>
        )
      }}
      fallback={
        <>
          {loaded && selected ? (
            <ListSection header={t('gallery.title')}>
              <ProfileGallery
                key={selected.characterId}
                characterId={selected.characterId}
                initialItems={selected.items}
                readOnly
                flush
              />
              {galleries.length > 1 ? (
                <MenuCell
                  label={t('settings.galleryPreviewCharacter')}
                  value={selected.name}
                  items={galleries.map((g) => ({
                    label: g.name,
                    systemImage: g.characterId === selected.characterId ? 'checkmark' : undefined,
                    onSelect: () => setSelectedId(g.characterId),
                  }))}
                />
              ) : (
                <ValueCell label={t('settings.galleryPreviewCharacter')} value={selected.name} />
              )}
            </ListSection>
          ) : loaded ? (
            <ListSection header={t('gallery.title')}>
              <View style={styles.empty}>
                <SFIcon name="photo.on.rectangle.angled" fallback="images-outline" size={26} color={colors.textFaint} />
                <Text style={styles.emptyText}>{t('settings.galleryPreviewEmpty')}</Text>
              </View>
            </ListSection>
          ) : null}

          <ListSection footer={t('settings.galleryLayoutNote')}>
            <SegmentCell
              label={t('settings.galleryLayout')}
              options={layoutOptions}
              value={galleryLayout}
              onChange={pickLayout}
            />
          </ListSection>
        </>
      }
    />
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    empty: { minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 16 },
    emptyText: { color: colors.textMuted, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  })
