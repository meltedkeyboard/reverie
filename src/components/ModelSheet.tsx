import { Fragment } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useTranslation } from '@/i18n'
import * as Haptics from '@/lib/haptics'
import { useStyles, type Colors } from '@/theme'

import { BottomSheet, useSheetTones } from './BottomSheet'
import { Check } from './Check'

type Props = {
  visible: boolean
  onClose: () => void
  models: string[]
  selected: string
  onSelect: (model: string) => void
}

// The models a server offers, one to a row, the chosen one checked. A tap only moves the
// check: the sheet stays up so the pick can be seen, and is closed like any other.
export function ModelSheet({ visible, onClose, models, selected, onSelect }: Props) {
  const styles = useStyles(createStyles)
  const tones = useSheetTones()
  const { t } = useTranslation()
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('settings.modelLabel')}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={[styles.card, { backgroundColor: tones.card }]}>
          {models.map((id, i) => (
            <Fragment key={id}>
              {i > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                onPress={() => {
                  if (id !== selected) Haptics.selectionAsync()
                  onSelect(id)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: id === selected }}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tones.pressed : tones.row }]}
              >
                <Text style={styles.name} numberOfLines={2}>
                  {id}
                </Text>
                <Check on={id === selected} />
              </Pressable>
            </Fragment>
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  )
}

const ROW_PADDING = 16

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 4 },
    card: { borderRadius: 26, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: ROW_PADDING, paddingVertical: 15 },
    separator: { height: StyleSheet.hairlineWidth, marginLeft: ROW_PADDING, marginRight: ROW_PADDING, backgroundColor: colors.borderStrong },
    name: { flex: 1, color: colors.text, fontSize: 17 },
  })
