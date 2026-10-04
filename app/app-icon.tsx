import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'

import { FormScreenHeader } from '@/components/FormScreenHeader'
import { useScreenPadding } from '@/components/GlassHeader'
import { useTranslation } from '@/i18n'
import { APP_ICONS, currentAppIcon, DEFAULT_ICON_PREVIEW, setAppIcon } from '@/lib/appIcons'
import * as Haptics from '@/lib/haptics'
import { reportError } from '@/lib/report'
import { useStyles, useTheme, type Colors } from '@/theme'

const COLUMNS = 3
// iOS rounds an icon at this share of its side.
const CORNER = 0.2237
const RING = 5

export default function AppIconScreen() {
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const { colors, scheme } = useTheme()
  const { t } = useTranslation()
  const [current, setCurrent] = useState(currentAppIcon)
  const [gridWidth, setGridWidth] = useState(0)

  const cell = gridWidth / COLUMNS
  const art = Math.max(0, cell - 28)
  const options = [{ name: null, preview: DEFAULT_ICON_PREVIEW[scheme] }, ...APP_ICONS]

  const choose = async (name: string | null) => {
    if (name === current) return
    Haptics.selectionAsync()
    try {
      await setAppIcon(name)
      setCurrent(name)
    } catch (err) {
      reportError(t('appIcon.failed'), err)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={padding}>
        <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)}>
          {options.map((option) => {
            const selected = option.name === current
            return (
              <Pressable
                key={option.name ?? 'default'}
                onPress={() => choose(option.name)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.cell, { width: cell }]}
              >
                <View
                  style={[
                    styles.ring,
                    {
                      width: art + RING * 2,
                      height: art + RING * 2,
                      borderRadius: art * CORNER + RING,
                      borderColor: selected ? colors.accent : 'transparent',
                    },
                  ]}
                >
                  <View style={{ width: art, height: art, borderRadius: art * CORNER, borderCurve: 'continuous', overflow: 'hidden' }}>
                    <Image source={option.preview} style={{ width: art, height: art }} />
                  </View>
                </View>
                <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>
                  {t(`appIcon.${option.name ?? 'default'}`)}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.hint}>{t('appIcon.hint')}</Text>
      </ScrollView>
      <FormScreenHeader title={t('settings.appIcon')} />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    cell: { alignItems: 'center', paddingVertical: 10 },
    ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderCurve: 'continuous' },
    label: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 6, paddingHorizontal: 4 },
    labelSelected: { color: colors.accent, fontWeight: '600' },
    hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 12, paddingHorizontal: 8 },
  })
