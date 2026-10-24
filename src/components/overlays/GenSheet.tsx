import { Icon } from '@/components/visuals/Icon'
import { ShimmerText } from '@/components/visuals/ShimmerText'
import { useNavigation, useRouter } from 'expo-router'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { ChatTurn } from '@/api/llm'
import { useDatabase } from '@/db/provider'
import {
  GEN_REASONING,
  GEN_TOKENS,
  loadGenReasoning,
  loadGenTokens,
  saveGenReasoning,
  saveGenTokens,
} from '@/db/prefs/generation'
import { loadSettings } from '@/db/prefs/settings'
import { useAbortable } from '@/hooks/util/useAbortable'
import { useElapsedSeconds } from '@/hooks/util/useElapsedSeconds'
import { useTranslation } from '@/i18n'
import { errorMessage } from '@/lib/core/errors'
import { countLabel } from '@/lib/core/format'
import * as Haptics from '@/lib/ui/haptics'
import { isIOS } from '@/lib/core/platform'
import { computeDiff } from '@/lib/chat/diff'
import { cleanGenerated, countWords, streamGeneration } from '@/lib/chat/promptGen'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

import { Chip } from '../controls/Chip'
import { PillButton } from '../controls/PillButton'
import { Segmented } from '../controls/Segmented'
import { FadingRow } from '../controls/ChipGroup'
import { ListFooter, ListSection } from '../lists/GroupedList'
import { NativeAreaRow, NativeForm, NativeHostedRow, NativeSection, nativeForm } from '../lists/NativeForm'
import { Pager } from '../lists/Pager'
import { GenRow, GenSection, GenSlider, GenSwitch, nativeGen } from './GenCells'

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
// with the bar buttons of UIKit, glass on iOS 26. With SwiftUI the page is the system's own
// list too (see GenCells), the button under it staying React Native.
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
  // The limits are kept from one opening to the next; the window only says when they are cut.
  const [maxTokens, setMaxTokens] = useState<number>(GEN_TOKENS.default)
  const [reasoningBudget, setReasoningBudget] = useState<number>(GEN_REASONING.default)
  const [contextTokens, setContextTokens] = useState<number | null>(null)
  const [versions, setVersions] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [live, setLive] = useState<string | null>(null)
  const [activity, setActivity] = useState<{ thinking: boolean; since: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [viewMode, setViewMode] = useState<'text' | 'diff'>('text')
  const [liveThought, setLiveThought] = useState<string | null>(null)
  const task = useAbortable()
  // A slider moved is saved once it rests: a write to the database on every step of a fast
  // drag kept the JS thread busy, and the system's slider stuttered under the finger.
  // Closing the sheet saves at once what is still waiting.
  const pendingSaves = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; save: () => void }>>({})
  const saveLater = (key: string, save: () => void) => {
    clearTimeout(pendingSaves.current[key]?.timer)
    const timer = setTimeout(() => {
      delete pendingSaves.current[key]
      save()
    }, 400)
    pendingSaves.current[key] = { timer, save }
  }
  useEffect(() => {
    const pending = pendingSaves.current
    return () =>
      Object.values(pending).forEach(({ timer, save }) => {
        clearTimeout(timer)
        save()
      })
  }, [])
  const versionCount = useRef(0)

  const busy = activity !== null
  const thinkingSecs = useElapsedSeconds(Boolean(activity?.thinking), activity?.since)
  const result = live ?? versions[index] ?? null
  const hasBefore = before.trim().length > 0
  // The comparison's runs, a space put between a word taken out and the one put in its place
  // where neither has it.
  const diffParts = useMemo(() => {
    const parts = hasBefore && result ? computeDiff(before, result) : []
    return parts.map((part, i) => {
      const next = parts[i + 1]
      const needsSpace = part.type === 'removed' && next?.type === 'added' && !/\s$/.test(part.value) && !/^\s/.test(next.value)
      return needsSpace ? { ...part, value: `${part.value} ` } : part
    })
  }, [hasBefore, before, result])

  useEffect(() => {
    // A value kept under the steps of an earlier version is put on the nearest one of now.
    const onStep = (limits: { min: number; step: number }) => (v: number) => limits.min + Math.round((v - limits.min) / limits.step) * limits.step
    loadGenTokens(db).then((v) => setMaxTokens(onStep(GEN_TOKENS)(v)))
    loadGenReasoning(db).then((v) => setReasoningBudget(onStep(GEN_REASONING)(v)))
    loadSettings(db).then((cfg) => setContextTokens(cfg.contextTokens))
  }, [db])

  const pushVersion = (version: string) => {
    setIndex(versionCount.current)
    versionCount.current += 1
    setVersions((prev) => [...prev, version])
  }

  const run = async (revision?: Revision) => {
    const ctrl = task.start()
    setPhase('result')
    setError(null)
    setLive('')
    setLiveThought(null)
    let text = ''
    try {
      const cfg = await loadSettings(db)
      setActivity({ thinking: Boolean(thinking), since: Date.now() })
      let hadCutoff = false
      let hadReasoning = false
      let thoughts = ''
      for await (const part of streamGeneration(cfg, build(revision), ctrl.signal, {
        thinking,
        edit: edits || !!revision,
        maxTokens,
        reasoningBudget,
      })) {
        if (part.kind === 'reasoning') {
          hadReasoning = true
          setActivity((prev) => (prev?.thinking ? prev : { thinking: true, since: Date.now() }))
          thoughts += part.text
          setLiveThought(thoughts)
          continue
        }
        if (part.kind === 'cutoff') {
          hadCutoff = true
          continue
        }
        if (!text) {
          setActivity({ thinking: false, since: Date.now() })
          setLiveThought(null)
        }
        text += part.text
        setLive(text)
      }
      const done = cleanGenerated(text)
      if (!done) {
        if (hadCutoff && (hadReasoning || thinking)) {
          throw new Error(t('chat.thinkingOutOfTokens'))
        }
        throw new Error(t('promptGen.empty'))
      }
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
        setLiveThought(null)
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
    setLiveThought(null)
    setViewMode('text')
    setPhase('compose')
  }

  const status = activity?.thinking
    ? t('promptGen.thinking', { secs: thinkingSecs })
    : activity
      ? t('gen.writing')
      : result !== null
        ? countLabel(countWords(result), 'word', locale)
        : ''

  const wanted = maxTokens + (thinking ? reasoningBudget : 0)
  const composeView = (
    <>
      {compose(<GenSwitch label={t('gen.thinking')} value={thinking} onValueChange={setThinking} />)}
      <GenSection
        footer={
          contextTokens !== null && wanted > contextTokens
            ? t('gen.limitsOverWindow', { window: contextTokens })
            : t('gen.limitsHint')
        }
      >
        <GenSlider
          label={t('gen.maxTokens')}
          value={maxTokens}
          min={GEN_TOKENS.min}
          max={GEN_TOKENS.max}
          step={GEN_TOKENS.step}
          onChange={(tokens) => {
            setMaxTokens(tokens)
            saveLater('tokens', () => saveGenTokens(db, tokens))
          }}
        />
        {thinking ? (
          <GenSlider
            label={t('editor.reasoningBudget')}
            value={reasoningBudget}
            min={GEN_REASONING.min}
            max={GEN_REASONING.max}
            step={GEN_REASONING.step}
            onChange={(tokens) => {
              setReasoningBudget(tokens)
              saveLater('reasoning', () => saveGenReasoning(db, tokens))
            }}
          />
        ) : null}
      </GenSection>
    </>
  )

  const showBar = (versions.length > 1 || hasBefore) && !busy && result !== null
  const pager =
    versions.length > 1 ? (
      <Pager index={index} count={versions.length} onChange={setIndex} label={t('promptGen.version', { n: index + 1, total: versions.length })} />
    ) : null
  // One line that scrolls sideways; the chips are not interactive glass, whose spring would
  // pull them along with the scroll.
  const tweakChips = (
    <FadingRow style={styles.tweaks} fadeColor={colors.surface} inset={16}>
      {tweaks.map((key) => (
        <Chip key={key} label={t(key)} active={false} onPress={() => revise(t(`${key}.note`))} />
      ))}
    </FadingRow>
  )
  const sendButton = (
    <Pressable
      onPress={() => revise(note)}
      disabled={!note.trim()}
      accessibilityRole="button"
      accessibilityLabel={t('promptGen.reviseLabel')}
      style={[styles.sendButton, !note.trim() && { backgroundColor: colors.borderStrong }]}
    >
      <Icon name="arrow-up" size={18} color={note.trim() ? ON_ACCENT : colors.textFaint} />
    </Pressable>
  )
  const thinkingView = (
    <View style={styles.thinkingContainer}>
      <ShimmerText
        text={activity?.thinking ? t('promptGen.thinkingShort') : t('gen.writing')}
        style={styles.resultText}
        from={colors.textFaint}
        to={colors.text}
      />
      {liveThought ? (
        <Text style={styles.liveThoughtText} numberOfLines={5}>
          {liveThought.trim().slice(-400)}
        </Text>
      ) : null}
    </View>
  )

  // The result in the system's list: the text a field of it, which the reply is written into
  // as it comes and which keeps over the keyboard while it is edited, the comparison its text
  // in colors. The pager, the shimmer while the model thinks, the chips of the revisions and
  // the send button stay React Native.
  const renderNativeResult = () => {
    const { HStack, Spacer, Picker, Text: SwiftText, RNHostView } = nativeForm!.ui
    const { pickerStyle, labelsHidden, tag, foregroundStyle, textSelection } = nativeForm!.modifiers
    return (
      <>
        <NativeSection
          title={resultLabel}
          footer={[...(status ? [{ text: status }] : []), ...(error ? [{ text: error, danger: true }] : [])]}
        >
          {showBar ? (
            <HStack spacing={12}>
              {hasBefore ? (
                <Picker selection={viewMode} onSelectionChange={(v: 'text' | 'diff') => setViewMode(v)} modifiers={[pickerStyle('segmented'), labelsHidden()]}>
                  <SwiftText modifiers={[tag('text')]}>{t('promptGen.text')}</SwiftText>
                  <SwiftText modifiers={[tag('diff')]}>{t('promptGen.diff')}</SwiftText>
                </Picker>
              ) : (
                <Spacer />
              )}
              {pager ? <RNHostView matchContents>{pager}</RNHostView> : null}
            </HStack>
          ) : null}
          {busy && !result ? (
            <NativeHostedRow>
              <View style={styles.nativeThinking}>{thinkingView}</View>
            </NativeHostedRow>
          ) : busy ? (
            <SwiftText>
              {result}
              <SwiftText modifiers={[foregroundStyle(colors.accent)]}>{' ' + String.fromCharCode(0x258d)}</SwiftText>
            </SwiftText>
          ) : result === null ? null : hasBefore && viewMode === 'diff' ? (
            <SwiftText modifiers={[textSelection(true)]}>
              {diffParts.map((part, i) =>
                part.type === 'added' ? (
                  <SwiftText key={i} modifiers={[foregroundStyle(colors.success)]}>
                    {part.value}
                  </SwiftText>
                ) : part.type === 'removed' ? (
                  // A nested text takes only colors and fonts, so the line through is Markdown's.
                  <SwiftText key={i} markdownEnabled modifiers={[foregroundStyle(colors.danger)]}>
                    {struckThrough(part.value)}
                  </SwiftText>
                ) : (
                  <SwiftText key={i}>{part.value}</SwiftText>
                )
              )}
            </SwiftText>
          ) : (
            <NativeAreaRow
              value={result}
              onChangeText={(text) => setVersions((prev) => prev.map((v, i) => (i === index ? text : v)))}
              lines={1}
              maxLines={null}
            />
          )}
        </NativeSection>

        {result !== null && !busy ? (
          <NativeSection title={t('promptGen.reviseLabel')}>
            <NativeHostedRow>{tweakChips}</NativeHostedRow>
            {/* Typed like a message: the field and the send button beside it. */}
            <HStack alignment="bottom" spacing={10}>
              <NativeAreaRow value={note} onChangeText={setNote} placeholder={t('promptGen.revisePlaceholder')} lines={1} maxLines={5} />
              <RNHostView matchContents>{sendButton}</RNHostView>
            </HStack>
          </NativeSection>
        ) : null}
      </>
    )
  }

  const resultView = nativeGen ? null : (
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
        {showBar ? (
          <View style={styles.resultBar}>
            <View style={styles.compare}>
              {hasBefore ? (
                <Segmented
                  options={[
                    { value: 'text', label: t('promptGen.text') },
                    { value: 'diff', label: t('promptGen.diff') },
                  ]}
                  value={viewMode}
                  onChange={(v) => setViewMode(v as 'text' | 'diff')}
                />
              ) : null}
            </View>
            {pager}
          </View>
        ) : null}
        {result !== null || busy ? (
          <View style={styles.resultRow}>
            {busy ? (
              !result ? (
                thinkingView
              ) : (
                <Text style={styles.resultText}>
                  {result}
                  <Text style={{ color: colors.accent }}>{' ' + String.fromCharCode(0x258d)}</Text>
                </Text>
              )
            ) : hasBefore && viewMode === 'diff' ? (
              <Text style={styles.resultText} selectable>
                {diffParts.map((part, i) => (
                  <Text
                    key={i}
                    style={part.type === 'added' ? styles.diffAdded : part.type === 'removed' ? styles.diffRemoved : undefined}
                  >
                    {part.value}
                  </Text>
                ))}
              </Text>
            ) : (
              <TextInput
                key={index}
                value={result ?? ''}
                onChangeText={(text) => setVersions((prev) => prev.map((v, i) => (i === index ? text : v)))}
                multiline
                scrollEnabled={false}
                selectionColor={colors.accent}
                style={[styles.resultText, styles.resultInput]}
              />
            )}
          </View>
        ) : null}
      </ListSection>

      {result !== null && !busy ? (
        <ListSection header={t('promptGen.reviseLabel')}>
          {tweakChips}
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
            {sendButton}
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
      {nativeGen ? (
        <NativeForm>{phase === 'compose' ? composeView : renderNativeResult()}</NativeForm>
      ) : (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
        >
          {phase === 'compose' ? composeView : resultView}
        </KeyboardAwareScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
    </View>
  )
}

// Presets under a field: plain chips that fill it in, in one line that scrolls sideways.
export function PresetChips({ items, onPick }: { items: { key: string; label: string }[]; onPick: (key: string) => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <GenRow>
      <FadingRow style={styles.presets} fadeColor={colors.surface} inset={16}>
        {items.map((item) => (
          <Chip key={item.key} label={item.label} active={false} onPress={() => onPick(item.key)} />
        ))}
      </FadingRow>
    </GenRow>
  )
}

// Text taken out, struck through by Markdown: word by word, as a line through runs only
// between marks that touch the text, with what Markdown would read as its own marks escaped.
function struckThrough(text: string) {
  return text
    .split(/(\s+)/)
    .map((piece) => (!piece || /^\s+$/.test(piece) ? piece : `~~${piece.replace(/[\\`*_{}[\]()#+\-.!~|<>]/g, '\\$&')}~~`))
    .join('')
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
    placeholder: { color: colors.textFaint },
    thinkingContainer: { gap: 8 },
    // As far in as the text of a row of the system's list.
    nativeThinking: { paddingHorizontal: 20, paddingVertical: 11 },
    liveThoughtText: {
      color: colors.textFaint,
      fontSize: 14,
      lineHeight: 20,
      fontStyle: 'italic',
    },
    diffAdded: {
      color: colors.success,
      backgroundColor: colors.success + '26',
    },
    diffRemoved: {
      color: colors.danger,
      textDecorationLine: 'line-through',
      backgroundColor: colors.danger + '26',
    },
    tweaks: { paddingVertical: 12 },
    presets: { paddingVertical: 12 },
    noteRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 8 },
    noteInput: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 22, paddingTop: 7, paddingBottom: 7, paddingHorizontal: 0, maxHeight: 120 },
    sendButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg },
  })
