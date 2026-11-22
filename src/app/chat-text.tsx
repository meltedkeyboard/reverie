import { useRouter } from 'expo-router'
import { useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { ChatPreview, PREVIEW_HEIGHT } from '@/components/chat/ChatPreview'
import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { Slider } from '@/components/controls/Slider'
import { ButtonCell, ListSection, MenuCell, SwitchCell } from '@/components/lists/GroupedList'
import { nativeForm, NativeForm, NativeHostedRow, NativeSection } from '@/components/lists/NativeForm'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { SFIcon } from '@/components/visuals/SFIcon'
import { CHAT_TEXT_SCALE_RANGE, DEFAULT_CHAT_FONT, SYSTEM_FONT } from '@/db/prefs/settings'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import { useChatTextSettings } from '@/lib/chat/chatText'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'
import { installedFontFamilies } from '../../modules/reverie-fonts'

const FALLBACK_FAMILIES =
  isAndroid
    ? ['serif', 'sans-serif', 'sans-serif-light', 'sans-serif-condensed', 'serif-monospace', 'monospace', 'casual', 'cursive']
    : ['Georgia', 'Palatino', 'Iowan Old Style', 'Charter', 'Avenir Next', 'Times New Roman', 'Helvetica Neue', 'Menlo']

function snap(value: number) {
  const { default: normal } = CHAT_TEXT_SCALE_RANGE
  return Math.abs(value - normal) < 0.025 ? normal : Math.round(value * 100) / 100
}

export default function ChatTextScreen() {
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { font, userFont, setUserFont, userMarkdown, setUserMarkdown, scale, setFont, setScale, reset } = useChatTextSettings()

  const resetSize = () => {
    Haptics.selectionAsync()
    setScale(CHAT_TEXT_SCALE_RANGE.default)
  }
  const untouched = font === DEFAULT_CHAT_FONT && !userFont && scale === CHAT_TEXT_SCALE_RANGE.default
  const atNormal = useRef(scale === CHAT_TEXT_SCALE_RANGE.default)
  const dragged = useRef(scale)
  const drag = (value: number) => {
    const next = snap(value)
    const onNormal = next === CHAT_TEXT_SCALE_RANGE.default
    if (onNormal && !atNormal.current) Haptics.selectionAsync()
    atNormal.current = onNormal
    setScale(next, false)
  }

  const families = useMemo(() => {
    const installed = installedFontFamilies()
    return [SYSTEM_FONT, ...(installed.length ? installed : FALLBACK_FAMILIES)]
  }, [])
  const items = useMemo<MenuItem[]>(
    () =>
      families.map((family) => ({
        label: family === SYSTEM_FONT ? t('chatFont.system') : family,
        systemImage: family === font ? 'checkmark' : undefined,
        onSelect: () => setFont(family),
      })),
    [families, font, setFont, t]
  )

  const renderNative = ({ ui, modifiers }: NonNullable<typeof nativeForm>) => {
    const { Picker, Text: SwiftText, HStack, Toggle, Slider: SwiftSlider, Button: SwiftButton, Image } = ui
    const { pickerStyle, tag, font: swiftFont, foregroundStyle, buttonStyle, disabled, accessibilityLabel } = modifiers
    const secondary = { type: 'hierarchical', style: 'secondary' } as const
    return (
      <NativeForm>
        <NativeSection>
          <NativeHostedRow height={PREVIEW_HEIGHT} clear>
            <ChatPreview flush />
          </NativeHostedRow>
        </NativeSection>

        <NativeSection title={t('settings.fontScreen')}>
          <HStack spacing={12}>
            <SwiftText modifiers={[swiftFont({ size: 14, weight: 'semibold' }), foregroundStyle(secondary)]}>A</SwiftText>
            <SwiftSlider
              value={scale}
              min={CHAT_TEXT_SCALE_RANGE.min}
              max={CHAT_TEXT_SCALE_RANGE.max}
              onValueChange={(value) => {
                dragged.current = value
                drag(value)
              }}
              onEditingChanged={(editing) => {
                if (!editing) setScale(snap(dragged.current))
              }}
              modifiers={[accessibilityLabel(t('settings.chatTextSize'))]}
            />
            <SwiftText modifiers={[swiftFont({ size: 24, weight: 'semibold' }), foregroundStyle(secondary)]}>A</SwiftText>
            <SwiftButton
              onPress={resetSize}
              modifiers={[buttonStyle('borderless'), disabled(scale === CHAT_TEXT_SCALE_RANGE.default), accessibilityLabel(t('settings.chatResetSize'))]}
            >
              <Image systemName="arrow.counterclockwise" size={18} />
            </SwiftButton>
          </HStack>
          <Picker label={t('settings.chatFontField')} selection={font} onSelectionChange={(next: string) => setFont(next)} modifiers={[pickerStyle('menu')]}>
            {families.map((family) => (
              <SwiftText key={family} modifiers={[tag(family)]}>
                {family === SYSTEM_FONT ? t('chatFont.system') : family}
              </SwiftText>
            ))}
          </Picker>
          <Toggle label={t('settings.chatUserFont')} isOn={userFont} onIsOnChange={setUserFont} />
          <Toggle label={t('settings.chatUserMarkdown')} isOn={userMarkdown} onIsOnChange={setUserMarkdown} />
        </NativeSection>

        <NativeSection>
          <SwiftButton label={t('settings.chatReset')} onPress={reset} modifiers={[disabled(untouched)]} />
        </NativeSection>
      </NativeForm>
    )
  }

  return (
    <View style={styles.screen}>
      {nativeForm ? (
        renderNative(nativeForm)
      ) : (
        <ScrollView contentContainerStyle={padding}>
          <ChatPreview />

          <ListSection header={t('settings.fontScreen')}>
            <View style={styles.sizeRow}>
              <Text style={styles.small}>A</Text>
              <Slider
                value={scale}
                minimumValue={CHAT_TEXT_SCALE_RANGE.min}
                maximumValue={CHAT_TEXT_SCALE_RANGE.max}
                onValueChange={drag}
                onSlidingComplete={(v) => setScale(snap(v))}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.borderStrong}
                thumbTintColor={ON_ACCENT}
                accessibilityLabel={t('settings.chatTextSize')}
                style={styles.slider}
              />
              <Text style={styles.large}>A</Text>
              <Pressable
                onPress={resetSize}
                disabled={scale === CHAT_TEXT_SCALE_RANGE.default}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('settings.chatResetSize')}
                style={({ pressed }) => [styles.sizeReset, pressed && { opacity: 0.5 }]}
              >
                <SFIcon
                  name="arrow.counterclockwise"
                  fallback="refresh"
                  size={20}
                  color={scale === CHAT_TEXT_SCALE_RANGE.default ? colors.textFaint : colors.accent}
                />
              </Pressable>
            </View>
            <MenuCell label={t('settings.chatFontField')} value={font === SYSTEM_FONT ? t('chatFont.system') : font} items={items} />
            <SwitchCell label={t('settings.chatUserFont')} value={userFont} onValueChange={setUserFont} />
            <SwitchCell label={t('settings.chatUserMarkdown')} value={userMarkdown} onValueChange={setUserMarkdown} />
          </ListSection>

          <ListSection>
            <ButtonCell label={t('settings.chatReset')} onPress={reset} disabled={untouched} />
          </ListSection>
        </ScrollView>
      )}
      {isAndroid ? (
        <GlassHeader
          floating
          centerTitle
          left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        >
          <TabTitle star={false}>{t('settings.fontScreen')}</TabTitle>
        </GlassHeader>
      ) : (
        <FormScreenHeader title={t('settings.fontScreen')} />
      )}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    sizeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 },
    small: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    large: { color: colors.textMuted, fontSize: 24, fontWeight: '600' },
    slider: { flex: 1, height: 40, marginHorizontal: 12 },
    sizeReset: { marginLeft: 14 },
  })
