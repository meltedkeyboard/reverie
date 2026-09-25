import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '@/components/Button'
import { ChatBackground } from '@/components/ChatBackground'
import { GlassButton, GlassSurface, useGlassStyles } from '@/components/Glass'
import { GlassHeader, HeaderTitle } from '@/components/GlassHeader'
import { ParamSlider } from '@/components/ParamSlider'
import { Segmented } from '@/components/Segmented'
import type { BackgroundEffect } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { backgroundDraft } from '@/lib/backgroundDraft'
import { withAlpha } from '@/lib/color'
import { liquidGlass } from '@/lib/nativeUI'
import { CHAT_MAX_WIDTH, useColors, useStyles, type Colors } from '@/theme'

const percent = (value: number) => `${Math.round(value * 100)}%`

// An empty chat with the picture behind it, to try the effect on before it is kept.
export default function BackgroundScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const glass = useGlassStyles()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  // Read once: the draft may be replaced under a screen still closing.
  const [draft] = useState(backgroundDraft)
  const [effect, setEffect] = useState<BackgroundEffect>(draft?.effect ?? 'blur')
  const [intensity, setIntensity] = useState(draft?.intensity ?? 0.5)
  const [bubbleTransparency, setBubbleTransparency] = useState(draft?.bubbleTransparency ?? 0.3)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const done = () => {
    draft?.onDone({ effect, intensity, bubbleTransparency })
    close()
  }

  if (!draft) return <View style={styles.screen} />

  const options: { value: BackgroundEffect; label: string }[] = [
    { value: 'blur', label: t('background.effectBlur') },
    { value: 'dim', label: t('background.effectDim') },
  ]

  return (
    <View style={styles.screen}>
      <ChatBackground uri={draft.uri} effect={effect} intensity={intensity} />

      <View style={styles.empty} pointerEvents="none">
        <Text style={styles.emptyName}>{draft.characterName}</Text>
        <Text style={styles.emptyHint}>{t('chat.emptyHint')}</Text>
      </View>

      {/* A message of the user's, to judge how see-through its bubble is. */}
      <View style={styles.sample} pointerEvents="none">
        <View style={[styles.bubble, { backgroundColor: withAlpha(colors.bubble, 1 - bubbleTransparency) }]}>
          <Text style={styles.bubbleText}>{t('background.sampleMessage')}</Text>
        </View>
      </View>

      <GlassHeader floating left={<GlassButton icon="chevron-back" iconSize={26} onPress={close} />}>
        <HeaderTitle>{t('background.title')}</HeaderTitle>
      </GlassHeader>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
        {/* Stands in for the composer, so the picture is judged with the real bar on it. */}
        <GlassSurface style={styles.fakeField} fallbackStyle={glass.solid}>
          <Text style={styles.fakePlaceholder}>{t('chat.messagePlaceholder')}</Text>
        </GlassSurface>

        {/* With Liquid Glass each control is its own piece of glass, as glass on glass
            would muddy both; without it they share one solid panel. */}
        <View style={[styles.panel, !liquidGlass && glass.solid]}>
          <Segmented glass options={options} value={effect} onChange={setEffect} />
          <GlassSurface style={styles.slider}>
            <ParamSlider
              label={t('background.intensity')}
              value={intensity}
              min={0}
              max={1}
              step={0.05}
              formatValue={percent}
              onChange={setIntensity}
            />
            <ParamSlider
              label={t('background.bubbleTransparency')}
              value={bubbleTransparency}
              min={0}
              max={1}
              step={0.05}
              formatValue={percent}
              onChange={setBubbleTransparency}
            />
          </GlassSurface>
          <Button variant="glass" label={t('common.save')} onPress={done} />
        </View>
      </View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
    emptyName: { color: colors.text, fontSize: 22, fontWeight: '600' },
    emptyHint: { color: colors.textMuted, fontSize: 15 },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 10,
      gap: 8,
      width: '100%',
      maxWidth: CHAT_MAX_WIDTH,
      alignSelf: 'center',
    },
    sample: { position: 'absolute', top: '22%', right: 16, left: 56, alignItems: 'flex-end' },
    bubble: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10 },
    bubbleText: { color: colors.text, fontSize: 16, lineHeight: 22 },
    fakeField: { borderRadius: 22, paddingVertical: 11, paddingHorizontal: 16 },
    fakePlaceholder: { color: colors.textFaint, fontSize: 16 },
    panel: { borderRadius: 24, padding: 12, gap: 10 },
    slider: { borderRadius: 22, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  })
