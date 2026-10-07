import { Icon } from '@/components/visuals/Icon'
import { useNavigation, useRouter } from 'expo-router'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { ChatTurn } from '@/api/llm'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/prefs/settings'
import { useAbortable } from '@/hooks/util/useAbortable'
import { useElapsedSeconds } from '@/hooks/util/useElapsedSeconds'
import { useTranslation } from '@/i18n'
import { errorMessage } from '@/lib/core/errors'
import { countLabel } from '@/lib/core/format'
import * as Haptics from '@/lib/ui/haptics'
import { isIOS } from '@/lib/core/platform'
import { cleanGenerated, countWords, streamGeneration } from '@/lib/chat/promptGen'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

import { Chip } from '../controls/Chip'
import { PillButton } from '../controls/PillButton'
import { Segmented } from '../controls/Segmented'
import { FadingRow } from '../controls/ChipGroup'
import { ListFooter, ListSection, SwitchCell } from '../lists/GroupedList'
import { Pager } from '../lists/Pager'

export type Revision = { draft: string; note: string }

type Props = {
  title: string
  // The heading of the result group, as the field it goes into is called in the editor.
  resultLabel: string
  // The text there is now: shown under "Before", and replaced by Apply.
  current: string
  // What to write and how. Given the thinking switch of the sheet, to put among the
  // other settings of the request, in one group with them.
  compose: (thinkingCell: ReactNode) => ReactNode
  canGenerate: boolean
  generateLabel: string
  build: (revision?: Revision) => ChatTurn[]
  // The first request edits the text there is rather than writes a new one.
  edits?: boolean
  // Quick revisions of a result: keys whose `.note` says what to change.
  tweaks: string[]
  onApply: (text: string) => void
}

// The page of the generator sheet (app/generate.tsx), where the model writes a text of the
// editor (the system prompt, the greeting), in the grouped look of the editor: what to write,
// then the versions it wrote, each editable and comparable with the text there was, with
// revisions under them. The sheet and its bar are the system's: a form sheet of the stack
// with the bar buttons of UIKit, glass on iOS 26.
export function GenSheet({
  title,
  resultLabel,
  current: before,
  compose,
  canGenerate,
  generateLabel,
  build,
  edits = false,
  tweaks,
  onApply,
}: Props) {
  const db = useDatabase()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()

  const [phase, setPhase] = useState<'compose' | 'result'>('compose')
  // For this request only: it is not the character's own thinking mode.
  const [thinking, setThinking] = useState(false)
  const [versions, setVersions] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [live, setLive] = useState<string | null>(null)
  const [activity, setActivity] = useState<{ thinking: boolean; since: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [showBefore, setShowBefore] = useState(false)
  const task = useAbortable()
  const versionCount = useRef(0)

  const busy = activity !== null
  const thinkingSecs = useElapsedSeconds(Boolean(activity?.thinking), activity?.since)
  const result = live ?? versions[index] ?? null
  const hasBefore = before.trim().length > 0

  const pushVersion = (version: string) => {
    setIndex(versionCount.current)
    versionCount.current += 1
    setVersions((prev) => [...prev, version])
  }

  const run = async (revision?: Revision) => {
    const ctrl = task.start()
    setPhase('result')
    setError(null)
    setShowBefore(false)
    setLive('')
    let text = ''
    try {
      const cfg = await loadSettings(db)
      setActivity({ thinking: true, since: Date.now() })
      for await (const part of streamGeneration(cfg, build(revision), ctrl.signal, { thinking, edit: edits || !!revision })) {
        if (part.kind === 'reasoning') continue
        if (!text) setActivity({ thinking: false, since: Date.now() })
        text += part.text
        setLive(text)
      }
      const done = cleanGenerated(text)
      if (!done) throw new Error(t('promptGen.empty'))
      pushVersion(done)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (err) {
      // A stopped generation keeps what it wrote so far.
      if (ctrl.signal.aborted) {
        if (text.trim()) pushVersion(cleanGenerated(text))
      } else {
        setError(errorMessage(err))
      }
    } finally {
      if (task.finish(ctrl)) {
        setActivity(null)
        setLive(null)
      }
    }
  }

  const revise = (text: string) => {
    if (result === null || busy || !text.trim()) return
    setNote('')
    run({ draft: result, note: text })
  }

  // Leaving the screen aborts a generation still running (useAbortable).
  const close = () => router.back()

  const apply = () => {
    if (result === null || busy || !result.trim()) return
    onApply(result.trim())
    router.back()
  }

  const backToCompose = () => {
    task.stop()
    setError(null)
    setPhase('compose')
  }

  const status = activity?.thinking
    ? t('promptGen.thinking', { secs: thinkingSecs })
    : activity
      ? t('gen.writing')
      : result !== null
        ? countLabel(countWords(result), 'word', locale)
        : ''

  const composeView = compose(<SwitchCell label={t('gen.thinking')} value={thinking} onValueChange={setThinking} />)

  const comparing = hasBefore && showBefore && !busy
  const resultView = (
    <>
      <ListSection
        header={resultLabel}
        footer={
          <>
            {status ? <ListFooter>{status}</ListFooter> : null}
            {error ? <ListFooter danger>{error}</ListFooter> : null}
          </>
        }
      >
        {/* Versions and the comparison sit on top of the text they switch. */}
        {(versions.length > 1 || hasBefore) && !busy && result !== null ? (
          <View style={styles.resultBar}>
            <View style={styles.compare}>
              {hasBefore ? (
                <Segmented
                  options={[
                    { value: 'before', label: t('promptGen.before') },
                    { value: 'after', label: t('promptGen.after') },
                  ]}
                  value={showBefore ? 'before' : 'after'}
                  onChange={(v) => setShowBefore(v === 'before')}
                />
              ) : null}
            </View>
            {versions.length > 1 ? (
              <Pager
                index={index}
                count={versions.length}
                onChange={setIndex}
                label={t('promptGen.version', { n: index + 1, total: versions.length })}
              />
            ) : null}
          </View>
        ) : null}
        {result !== null || busy ? (
          <View style={styles.resultRow}>
            {busy ? (
              <Text style={[styles.resultText, !result && styles.placeholder]}>
                {result || t('promptGen.thinkingShort')}
                {result ? <Text style={{ color: colors.accent }}>{' ' + String.fromCharCode(0x258d)}</Text> : null}
              </Text>
            ) : comparing ? (
              <Text style={[styles.resultText, styles.beforeText]}>{before}</Text>
            ) : (
              <TextInput
                value={result ?? ''}
                onChangeText={(text) => setVersions((prev) => prev.map((v, i) => (i === index ? text : v)))}
                multiline
                scrollEnabled={false}
                selectionColor={colors.accent}
                style={[styles.resultText, styles.resultInput]}
              />
            )}
            {busy ? <ActivityIndicator style={styles.spinner} size="small" color={colors.accent} /> : null}
          </View>
        ) : null}
      </ListSection>

      {result !== null && !busy ? (
        <ListSection header={t('promptGen.reviseLabel')}>
          {/* One line that scrolls sideways; the chips are not interactive glass, whose
              spring would pull them along with the scroll. */}
          <FadingRow style={styles.tweaks} fadeColor={colors.surface} inset={16}>
            {tweaks.map((key) => (
              <Chip key={key} label={t(key)} active={false} onPress={() => revise(t(`${key}.note`))} />
            ))}
          </FadingRow>
          {/* Typed like a message: the field and the send button beside it. */}
          <View style={styles.noteRow}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('promptGen.revisePlaceholder')}
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              multiline
              style={styles.noteInput}
            />
            <Pressable
              onPress={() => revise(note)}
              disabled={!note.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('promptGen.reviseLabel')}
              style={[styles.sendButton, !note.trim() && { backgroundColor: colors.borderStrong }]}
            >
              <Icon name="arrow-up" size={18} color={note.trim() ? ON_ACCENT : colors.textFaint} />
            </Pressable>
          </View>
        </ListSection>
      ) : null}
    </>
  )

  const footer =
    phase === 'compose' ? (
      <PillButton filled label={generateLabel} onPress={() => run()} disabled={!canGenerate} color={colors.accent} />
    ) : busy ? (
      <PillButton label={t('promptGen.stop')} onPress={task.stop} color={colors.danger} />
    ) : result === null ? (
      <PillButton label={t('promptGen.retry')} onPress={() => run()} color={colors.accent} />
    ) : (
      <PillButton label={t('promptGen.another')} onPress={() => run()} />
    )

  // The bar: close (or back to the settings from a result) on the left, and putting the
  // result in on the right, the prominent button of iOS 26.
  const back = phase === 'result'
  const leftLabel = back ? t('promptGen.back') : t('common.cancel')
  const canApply = phase === 'result' && !busy && result !== null && result.trim().length > 0
  const applyLabel = hasBefore ? t('promptGen.replace') : t('promptGen.apply')
  const onLeft = back ? backToCompose : close

  // The handlers change on every render; the bar takes them through a ref, so it is set
  // again only when what it shows changes. Setting the options on every render made the
  // sheet lay its bar out again after each change of state, and the switches in it sprang
  // back. The rest of the bar is set once, in the root layout.
  const handlers = useRef({ onLeft, apply })
  handlers.current = { onLeft, apply }
  useLayoutEffect(() => {
    navigation.setOptions(
      isIOS
        ? {
            title,
            headerTitle: title,
            unstable_headerLeftItems: () => [
              {
                type: 'button',
                label: leftLabel,
                icon: { type: 'sfSymbol', name: back ? 'chevron.backward' : 'xmark' },
                onPress: () => handlers.current.onLeft(),
              },
            ],
            unstable_headerRightItems: () =>
              back
                ? [
                    {
                      type: 'button',
                      label: applyLabel,
                      icon: { type: 'sfSymbol', name: 'checkmark' },
                      variant: 'prominent',
                      tintColor: colors.accent,
                      disabled: !canApply,
                      onPress: () => handlers.current.apply(),
                    },
                  ]
                : [],
          }
        : {
            title,
            headerTitle: title,
            headerLeft: () => (
              <Pressable onPress={() => handlers.current.onLeft()} hitSlop={10}>
                <Text style={styles.headerButton}>{leftLabel}</Text>
              </Pressable>
            ),
            headerRight: () =>
              back ? (
                <Pressable onPress={() => handlers.current.apply()} disabled={!canApply} hitSlop={10}>
                  <Text style={[styles.headerButton, styles.headerApply, !canApply && styles.headerDisabled]}>{applyLabel}</Text>
                </Pressable>
              ) : null,
          }
    )
  }, [navigation, title, back, leftLabel, applyLabel, canApply, colors.accent, styles])

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {phase === 'compose' ? composeView : resultView}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
    </View>
  )
}

// Presets under a field: plain chips that fill it in, in one line that scrolls sideways.
export function PresetChips({ items, onPick }: { items: { key: string; label: string }[]; onPick: (key: string) => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <FadingRow style={styles.presets} fadeColor={colors.surface} inset={16}>
      {items.map((item) => (
        <Chip key={item.key} label={item.label} active={false} onPress={() => onPick(item.key)} />
      ))}
    </FadingRow>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1 },
    headerButton: { color: colors.accent, fontSize: 17 },
    headerApply: { fontWeight: '600' },
    headerDisabled: { opacity: 0.4 },
    content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 8 },
    resultBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
    compare: { flex: 1 },
    resultRow: { paddingHorizontal: 16, paddingVertical: 14 },
    resultText: { color: colors.text, fontSize: 17, lineHeight: 24 },
    resultInput: { padding: 0, textAlignVertical: 'top' },
    beforeText: { color: colors.textMuted },
    placeholder: { color: colors.textFaint },
    spinner: { position: 'absolute', top: 12, right: 12 },
    tweaks: { paddingVertical: 12 },
    presets: { paddingVertical: 12 },
    noteRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 8 },
    noteInput: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 22, paddingTop: 7, paddingBottom: 7, paddingHorizontal: 0, maxHeight: 120 },
    sendButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg },
  })
