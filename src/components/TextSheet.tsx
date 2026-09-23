import { useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTranslation } from '@/i18n'
import { fonts, useStyles, type Colors } from '@/theme'

import { PageSheet } from './PageSheet'

type Props = { text: string | null; onClose: () => void }

export function TextSheet({ text, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  // Keeps the text on screen while the sheet slides away after text turns null.
  const shown = useRef('')
  if (text !== null) shown.current = text

  return (
    <PageSheet
      visible={text !== null}
      onClose={onClose}
      title={t('textSheet.title')}
      right={
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.done}>{t('textSheet.done')}</Text>
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <Text selectable style={styles.text}>
          {shown.current}
        </Text>
      </ScrollView>
    </PageSheet>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    done: { color: colors.accent, fontSize: 17, fontWeight: '600' },
    text: { color: colors.text, fontFamily: fonts.prose, fontSize: 17, lineHeight: 27 },
  })
