import { Image } from 'expo-image'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassButton } from '@/components/Glass'
import { SFIcon } from '@/components/SFIcon'
import { useTranslation } from '@/i18n'
import { saveImage } from '@/lib/download'
import { viewerImage } from '@/lib/viewer'
import { useStyles, useTheme, type Colors } from '@/theme'

export default function ViewerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const { colors } = useTheme()
  const { t } = useTranslation()
  const styles = useStyles(createStyles)
  // Read once: the stored picture may change under a screen still closing.
  const [image] = useState(viewerImage)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))
  // Dismissing the share sheet rejects on some platforms; there is nothing to report.
  const save = () => image && saveImage(image.uri).catch(() => {})

  // The zoom lands on the picture's own frame, not the whole screen, so it grows
  // without stretching.
  const width = image ? Math.min(window.width, window.height * image.aspect) : 0
  const frame = { width, height: image ? width / image.aspect : 0 }

  return (
    <View style={styles.screen}>
      <Pressable style={styles.stage} onPress={close}>
        {image ? (
          <Link.AppleZoomTarget>
            <View style={frame}>
              <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
            </View>
          </Link.AppleZoomTarget>
        ) : null}
      </Pressable>
      <View style={[styles.bar, { top: insets.top + 4 }]} pointerEvents="box-none">
        <GlassButton icon="chevron-back" iconSize={26} onPress={close} />
        {image ? (
          <GlassButton icon="download-outline" onPress={save} accessibilityLabel={t('images.save')}>
            <SFIcon name="square.and.arrow.down" fallback="download-outline" size={20} color={colors.text} />
          </GlassButton>
        ) : null}
      </View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    bar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  })
