import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassButton } from '@/components/chrome/Glass'
import { CheckCell, ListSection } from '@/components/lists/GroupedList'
import { nativeCardList, NativeListPreview } from '@/components/lists/NativeCardList'
import { nativeForm, NativeForm, NativeSection, NativeSegmentRow } from '@/components/lists/NativeForm'
import { Segmented } from '@/components/controls/Segmented'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { LIST_CORNER_RANGE, setListCorner, setListSpacing, useListLook, type ListSpacing } from '@/db/prefs/listLook'
import { type AccentMode } from '@/db/prefs/settings'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import { Slider } from '@/components/controls/Slider'
import { SFIcon } from '@/components/visuals/SFIcon'
import * as Haptics from '@/lib/ui/haptics'
import {
  type Colors,
  FILL,
  ImmediateTheme,
  ON_ACCENT,
  paletteOf,
  THEMES,
  type ThemeMode,
  type ThemeName,
  useColors,
  useStyles,
  useTheme,
} from '@/theme'
import { useChatTextSettings } from '@/lib/chat/chatText'

const ACCENT_SWATCHES = [
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#00C7BE',
  '#30B0C7',
]

function ThemeIcon({ theme }: { theme: ThemeName }) {
  const styles = useStyles(createStyles)
  const { scheme } = useTheme()
  const palette = paletteOf(theme, scheme)
  return (
    <View style={[styles.themeIcon, { backgroundColor: palette.bg }]}>
      <View style={[styles.themeIconDot, { backgroundColor: palette.accent }]} />
      <View style={[styles.edge, styles.themeIconEdge]} pointerEvents="none" />
    </View>
  )
}

export default function ThemeScreen() {
  return (
    <ImmediateTheme>
      <ThemeSettings />
    </ImmediateTheme>
  )
}

function ThemeSettings() {
  const router = useRouter()
  const db = useDatabase()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { theme, setTheme, mode, setMode } = useTheme()
  const { accentMode, setAccentMode, customAccentColor, setCustomAccentColor } = useChatTextSettings()

  const modeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t('theme.system') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
  ]

  const accentOptions: { value: AccentMode; label: string }[] = [
    { value: 'theme', label: t('settings.accentTheme') },
    { value: 'dynamic', label: t('settings.accentDynamic') },
    { value: 'custom', label: t('settings.accentCustom') },
  ]

  const listLook = useListLook()
  const cornerDragged = useRef(listLook.corner)
  const dragCorner = (value: number) => {
    const next = Math.round(value)
    cornerDragged.current = next
    if (next === listLook.corner) return
    if (next === LIST_CORNER_RANGE.default) Haptics.selectionAsync()
    setListCorner(db, next, false)
  }
  const resetCorner = () => {
    Haptics.selectionAsync()
    setListCorner(db, LIST_CORNER_RANGE.default)
  }
  const spacingOptions: { value: ListSpacing; label: string }[] = [
    { value: 'compact', label: t('settings.listSpacingCompact') },
    { value: 'roomy', label: t('settings.listSpacingRoomy') },
  ]

  const renderNative = ({ ui, modifiers }: NonNullable<typeof nativeForm>) => {
    const { Picker, Text: SwiftText, HStack, Slider: SwiftSlider, Button: SwiftButton, Image, ColorPicker } = ui
    const { pickerStyle, tag, labelsHidden, buttonStyle, disabled, accessibilityLabel } = modifiers
    return (
      <NativeForm>
        <NativeSection title={t('settings.themeScreen')}>
          <Picker
            selection={theme}
            onSelectionChange={(next: ThemeName) => {
              Haptics.selectionAsync()
              setTheme(next)
            }}
            modifiers={[pickerStyle('inline'), labelsHidden()]}
          >
            {THEMES.map((name) => (
              <SwiftText key={name} modifiers={[tag(name)]}>
                {t(`theme.${name}`)}
              </SwiftText>
            ))}
          </Picker>
          <Picker
            selection={mode}
            onSelectionChange={(next: ThemeMode) => {
              Haptics.selectionAsync()
              setMode(next)
            }}
            modifiers={[pickerStyle('segmented'), labelsHidden()]}
          >
            {modeOptions.map((option) => (
              <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                {option.label}
              </SwiftText>
            ))}
          </Picker>
        </NativeSection>

        <NativeSection title={t('settings.accentTitle')}>
          <Picker
            selection={accentMode}
            onSelectionChange={(next: AccentMode) => {
              Haptics.selectionAsync()
              setAccentMode(next)
            }}
            modifiers={[pickerStyle('segmented'), labelsHidden()]}
          >
            {accentOptions.map((option) => (
              <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                {option.label}
              </SwiftText>
            ))}
          </Picker>
          {accentMode === 'custom' && ColorPicker ? (
            <ColorPicker
              label={t('settings.accentColor')}
              selection={customAccentColor}
              onSelectionChange={(next: string) => {
                setCustomAccentColor(next)
              }}
              supportsOpacity={false}
            />
          ) : null}
        </NativeSection>

        {nativeCardList ? (
          <NativeSection title={t('settings.listLook')} footer={t('settings.listLookHint')}>
            <NativeListPreview />
            <HStack spacing={12}>
              <Image systemName="square" size={17} color={colors.textMuted} />
              <SwiftSlider
                value={listLook.corner}
                min={LIST_CORNER_RANGE.min}
                max={LIST_CORNER_RANGE.max}
                onValueChange={dragCorner}
                onEditingChanged={(editing) => {
                  if (!editing) setListCorner(db, cornerDragged.current)
                }}
                modifiers={[accessibilityLabel(t('settings.listCorners'))]}
              />
              <Image systemName="circle" size={17} color={colors.textMuted} />
              <SwiftButton
                onPress={resetCorner}
                modifiers={[buttonStyle('borderless'), disabled(listLook.corner === LIST_CORNER_RANGE.default), accessibilityLabel(t('settings.listResetCorners'))]}
              >
                <Image systemName="arrow.counterclockwise" size={18} />
              </SwiftButton>
            </HStack>
            <NativeSegmentRow
              label={t('settings.listSpacing')}
              options={spacingOptions}
              value={listLook.spacing}
              onChange={(next) => {
                Haptics.selectionAsync()
                setListSpacing(db, next)
              }}
            />
          </NativeSection>
        ) : null}
      </NativeForm>
    )
  }

  return (
    <View style={styles.screen}>
      {nativeForm ? (
        renderNative(nativeForm)
      ) : (
        <ScrollView contentContainerStyle={padding}>
          <ListSection header={t('settings.themeScreen')}>
            {THEMES.map((name) => (
              <CheckCell
                key={name}
                label={t(`theme.${name}`)}
                checked={theme === name}
                onPress={() => setTheme(name)}
                leading={<ThemeIcon theme={name} />}
              />
            ))}
            <View style={styles.themeMode}>
              <Segmented options={modeOptions} value={mode} onChange={setMode} />
            </View>
          </ListSection>

          <ListSection header={t('settings.accentTitle')}>
            <View style={styles.themeMode}>
              <Segmented options={accentOptions} value={accentMode} onChange={setAccentMode} />
            </View>
            {accentMode === 'custom' ? (
              <View style={styles.customAccentRow}>
                {ACCENT_SWATCHES.map((swatch) => (
                  <Pressable
                    key={swatch}
                    onPress={() => setCustomAccentColor(swatch)}
                    style={[
                      styles.accentSwatch,
                      { backgroundColor: swatch },
                      customAccentColor.toLowerCase() === swatch.toLowerCase() && styles.accentSwatchActive,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </ListSection>

          {nativeCardList ? (
            <ListSection header={t('settings.listLook')} footer={t('settings.listLookHint')}>
              <NativeListPreview />
              <View style={styles.sizeRow}>
                <SFIcon name="square" fallback="square-outline" size={17} color={colors.textMuted} />
                <Slider
                  value={listLook.corner}
                  minimumValue={LIST_CORNER_RANGE.min}
                  maximumValue={LIST_CORNER_RANGE.max}
                  onValueChange={dragCorner}
                  onSlidingComplete={() => setListCorner(db, cornerDragged.current)}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.borderStrong}
                  thumbTintColor={ON_ACCENT}
                  accessibilityLabel={t('settings.listCorners')}
                  style={styles.slider}
                />
                <SFIcon name="circle" fallback="ellipse-outline" size={17} color={colors.textMuted} />
                <Pressable
                  onPress={resetCorner}
                  disabled={listLook.corner === LIST_CORNER_RANGE.default}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.listResetCorners')}
                  style={({ pressed }) => [styles.sizeReset, pressed && { opacity: 0.5 }]}
                >
                  <SFIcon
                    name="arrow.counterclockwise"
                    fallback="refresh"
                    size={20}
                    color={listLook.corner === LIST_CORNER_RANGE.default ? colors.textFaint : colors.accent}
                  />
                </Pressable>
              </View>
              <View style={styles.themeMode}>
                <Segmented
                  options={spacingOptions}
                  value={listLook.spacing}
                  onChange={(next) => {
                    Haptics.selectionAsync()
                    setListSpacing(db, next)
                  }}
                />
              </View>
            </ListSection>
          ) : null}
        </ScrollView>
      )}
      {isAndroid ? (
        <GlassHeader
          floating
          centerTitle
          left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        >
          <TabTitle star={false}>{t('settings.themeScreen')}</TabTitle>
        </GlassHeader>
      ) : (
        <FormScreenHeader title={t('settings.themeScreen')} />
      )}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    themeMode: { paddingHorizontal: 16, paddingVertical: 12 },
    themeIcon: { width: 29, height: 29, borderRadius: 7, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    themeIconDot: { width: 11, height: 11, borderRadius: 5.5 },
    themeIconEdge: { borderRadius: 7 },
    edge: { ...FILL, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderCurve: 'continuous' },
    sizeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 },
    slider: { flex: 1, height: 40, marginHorizontal: 12 },
    sizeReset: { marginLeft: 14 },
    customAccentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 14,
      alignItems: 'center',
    },
    accentSwatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    accentSwatchActive: {
      borderWidth: 3,
      borderColor: colors.text,
    },
  })
