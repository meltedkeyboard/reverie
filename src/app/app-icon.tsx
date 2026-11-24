import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/chrome/GlassHeader'
import { GROUP_CORNERS } from '@/components/lists/GroupedList'
import { Icon } from '@/components/visuals/Icon'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import { APP_ICON_SECTIONS, currentAppIcon, followsLook, previewFor, setAppIcon, type AppIcon } from '@/lib/settings/appIcons'
import * as Haptics from '@/lib/ui/haptics'
import { reportError } from '@/lib/transfer/report'
import { useStyles, useTheme, type Colors } from '@/theme'

const ICON_SIZE = 58
const ICON_RADIUS = 13.5
const ICON_PADDING_H = 16
const ICON_GAP = 14
const SEPARATOR_INSET = ICON_PADDING_H + ICON_SIZE + ICON_GAP

export default function AppIconScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const padding = useScreenPadding('form')
  const { scheme, colors } = useTheme()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()

  const [current, setCurrent] = useState(currentAppIcon)
  const [applying, setApplying] = useState<string | null>(null)

  const nameOf = (option: AppIcon) => t(`appIcon.${option.name ?? 'default'}`)

  const apply = async (option: AppIcon) => {
    if (option.name === current) {
      Haptics.selectionAsync()
      return
    }
    if (applying) return

    const key = option.name ?? 'default'
    setApplying(key)
    Haptics.selectionAsync()

    try {
      await setAppIcon(option.name)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setCurrent(option.name)
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      reportError(t('appIcon.failed'), err)
    } finally {
      setApplying(null)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + 12,
            paddingBottom: insets.bottom + 32,
            paddingLeft: padding.paddingLeft,
            paddingRight: padding.paddingRight,
          },
        ]}
      >
        {APP_ICON_SECTIONS.map((section) => (
          <View key={section.key} style={styles.section}>
            {section.key === 'classic' ? <Text style={styles.sectionHeader}>{t('appIcon.sectionClassic')}</Text> : null}
            <View style={styles.group}>
              {section.icons.map((option, index) => {
                const key = option.name ?? 'default'
                const inUse = option.name === current
                const isApplying = applying === key

                return (
                  <View key={key}>
                    {index > 0 ? <View style={styles.separator} /> : null}
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: inUse }}
                      accessibilityLabel={`${nameOf(option)}${inUse ? `, ${t('appIcon.inUse')}` : ''}`}
                      onPress={() => apply(option)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      <View style={styles.iconFrame}>
                        <Image source={previewFor(option, scheme)} style={styles.iconArt} />
                        <View style={styles.iconEdge} pointerEvents="none" />
                      </View>
                      <View style={styles.info}>
                        <Text style={styles.name} numberOfLines={1}>
                          {nameOf(option)}
                        </Text>
                        {followsLook(option) ? (
                          <Text style={styles.caption} numberOfLines={1}>
                            {t('appIcon.followsLook')}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.trailing}>
                        {isApplying ? (
                          <ActivityIndicator size="small" color={colors.accent} />
                        ) : inUse ? (
                          <Icon name="checkmark" size={22} color={colors.accent} />
                        ) : null}
                      </View>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {isAndroid ? (
        <GlassHeader
          floating
          centerTitle
          left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        >
          <TabTitle star={false}>{t('settings.appIcon')}</TabTitle>
        </GlassHeader>
      ) : (
        <FormScreenHeader title={t('settings.appIcon')} />
      )}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      gap: 28,
    },
    section: {
      gap: 10,
    },
    sectionHeader: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textMuted,
      paddingHorizontal: 16,
      letterSpacing: -0.2,
    },
    group: {
      backgroundColor: colors.surface,
      borderRadius: GROUP_CORNERS.radius,
      borderCurve: 'continuous',
      overflow: 'hidden',
    },
    row: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: ICON_PADDING_H,
      paddingVertical: 10,
    },
    rowPressed: {
      backgroundColor: colors.surfaceRaised,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderStrong,
      marginLeft: SEPARATOR_INSET,
    },
    iconFrame: {
      width: ICON_SIZE,
      height: ICON_SIZE,
      borderRadius: ICON_RADIUS,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
    iconArt: {
      width: '100%',
      height: '100%',
    },
    iconEdge: {
      ...StyleSheet.absoluteFill,
      borderRadius: ICON_RADIUS,
      borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    info: {
      flex: 1,
      marginLeft: ICON_GAP,
      justifyContent: 'center',
    },
    name: {
      fontSize: 17,
      fontWeight: '500',
      color: colors.text,
      letterSpacing: -0.2,
    },
    caption: {
      fontSize: 13,
      lineHeight: 17,
      color: colors.textMuted,
      marginTop: 2,
    },
    trailing: {
      minWidth: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
  })
