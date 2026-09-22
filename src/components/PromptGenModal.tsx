import { useSQLiteContext } from 'expo-sqlite'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { loadSettings } from '@/db/settings'
import { useTranslation } from '@/i18n'
import { generateSystemPrompt } from '@/lib/promptGen'
import { useColors } from '@/theme'

type Props = { visible: boolean; onClose: () => void; onGenerated: (prompt: string) => void }

export function PromptGenModal({ visible, onClose, onGenerated }: Props) {
  const db = useSQLiteContext()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { t } = useTranslation()

  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = description.trim().length > 0 && !busy

  const close = () => {
    if (busy) return
    setDescription('')
    setError(null)
    onClose()
  }

  const onGenerate = async () => {
    if (!canGenerate) return
    setBusy(true)
    setError(null)
    try {
      const cfg = await loadSettings(db)
      const prompt = await generateSystemPrompt(cfg, description)
      if (!prompt) throw new Error(t('promptGen.empty'))
      onGenerated(prompt)
      setDescription('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={close}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={close} hitSlop={10} disabled={busy}>
            <Text style={[styles.cancel, busy && { opacity: 0.4 }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('promptGen.title')}</Text>
          <Pressable onPress={onGenerate} hitSlop={10} disabled={!canGenerate}>
            <Text style={[styles.generate, !canGenerate && { color: colors.textFaint }]}>{t('promptGen.generate')}</Text>
          </Pressable>
        </View>

        <View style={{ padding: 20, paddingBottom: insets.bottom + 24, flex: 1 }}>
          <Text style={styles.hint}>{t('promptGen.hint')}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('promptGen.placeholder')}
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            multiline
            editable={!busy}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.busyText}>{t('promptGen.generating')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    title: { color: colors.text, fontSize: 17, fontWeight: '600' },
    cancel: { color: colors.textMuted, fontSize: 16 },
    generate: { color: colors.accent, fontSize: 16, fontWeight: '600' },
    hint: { color: colors.textFaint, fontSize: 13, marginBottom: 12, lineHeight: 18 },
    input: {
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      color: colors.text,
      fontSize: 16,
      padding: 14,
      minHeight: 140,
      textAlignVertical: 'top',
    },
    error: { color: colors.danger, fontSize: 13, marginTop: 12, lineHeight: 18 },
    busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    busyText: { color: colors.textMuted, fontSize: 14 },
  })
