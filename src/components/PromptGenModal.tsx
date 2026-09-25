import Ionicons from '@expo/vector-icons/Ionicons'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { ChatTurn } from '@/api/llm'
import { loadSettings } from '@/db/settings'
import { useAbortable } from '@/hooks/useAbortable'
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
import { useIsWideWeb } from '@/hooks/useResponsive'
import { useTranslation } from '@/i18n'
import { errorMessage } from '@/lib/errors'
import { plural } from '@/lib/format'
import * as Haptics from '@/lib/haptics'
import {
  buildGreetingMessages,
  buildPromptMessages,
  cleanGenerated,
  countWords,
  streamGeneration,
  type PromptFormat,
  type PromptGenInput,
  type PromptLength,
} from '@/lib/promptGen'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

import { useInputColors } from './Field'
import { Divider } from './motifs/Divider'
import { Eyebrow } from './motifs/Eyebrow'
import { FieldRow } from './motifs/FieldRow'
import { ShardButton } from './motifs/ShardButton'
import { ShardChip } from './motifs/ShardChip'
import { StarToggle } from './motifs/StarToggle'
import { PageSheet } from './PageSheet'
import { Pager } from './Pager'

export type GeneratedCharacter = { prompt: string; greeting: string | null }

type Props = {
  visible: boolean
  name: string
  currentPrompt: string
  currentGreeting: string
  onClose: () => void
  onApply: (result: GeneratedCharacter) => void
}

type Mode = 'new' | 'improve'
type Version = { prompt: string; greeting: string | null }
type Activity = { target: 'prompt' | 'greeting'; thinking: boolean; since: number }

const IDEA_KEYS = ['promptGen.idea1', 'promptGen.idea2', 'promptGen.idea3', 'promptGen.idea4']
const TWEAK_KEYS = ['promptGen.tweakShorter', 'promptGen.tweakLonger', 'promptGen.tweakSpeech', 'promptGen.tweakVivid']

export function PromptGenModal({ visible, name, currentPrompt, currentGreeting, onClose, onApply }: Props) {
  const db = useSQLiteContext()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const inputColors = useInputColors()
  const { t, locale } = useTranslation()
  const wide = useIsWideWeb()

  const [phase, setPhase] = useState<'compose' | 'result'>('compose')
  const [mode, setMode] = useState<Mode>('new')
  const [description, setDescription] = useState('')
  const [length, setLength] = useState<PromptLength>('medium')
  const [format, setFormat] = useState<PromptFormat>('prose')
  const [withGreeting, setWithGreeting] = useState(false)

  const [versions, setVersions] = useState<Version[]>([])
  const [index, setIndex] = useState(0)
  const [live, setLive] = useState<Version | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // A multiline TextInput doesn't grow with its text on web, so the height is set by hand.
  const [heights, setHeights] = useState<Partial<Record<'prompt' | 'greeting', number>>>({})
  const task = useAbortable()
  const versionCount = useRef(0)

  const hasCurrent = currentPrompt.trim().length > 0
  const busy = activity !== null
  const thinkingSecs = useElapsedSeconds(Boolean(activity?.thinking), activity?.since)
  const current = live ?? versions[index] ?? null

  // Opening the sheet on a character that already has a prompt most likely means
  // the user wants that prompt improved, not replaced from scratch.
  useEffect(() => {
    if (visible && phase === 'compose' && !description) setMode(hasCurrent ? 'improve' : 'new')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // A fixed height never lets the measured content shrink, so it is dropped whenever
  // another, possibly shorter version is shown.
  useEffect(() => setHeights({}), [index])

  const effectiveMode: Mode = hasCurrent ? mode : 'new'
  const canGenerate = effectiveMode === 'improve' || description.trim().length > 0

  const input = (): PromptGenInput => ({
    description,
    name,
    base: effectiveMode === 'improve' ? currentPrompt : null,
    options: { length, format },
    locale,
  })

  // Writes into draft as it streams, so a stopped generation still has the text so far.
  const streamInto = async (messages: ChatTurn[], target: Activity['target'], signal: AbortSignal, draft: Version) => {
    const cfg = await loadSettings(db)
    let text = ''
    setActivity({ target, thinking: true, since: Date.now() })
    for await (const part of streamGeneration(cfg, messages, signal)) {
      if (part.kind === 'reasoning') continue
      if (!text) setActivity({ target, thinking: false, since: Date.now() })
      text += part.text
      draft[target] = text
      setLive({ ...draft })
    }
    draft[target] = cleanGenerated(text)
  }

  const run = async (revision?: { draft: string; note: string }) => {
    const ctrl = task.start()
    setPhase('result')
    setError(null)

    const draft: Version = { prompt: '', greeting: withGreeting ? '' : null }
    setLive({ ...draft })
    try {
      await streamInto(buildPromptMessages(input(), revision), 'prompt', ctrl.signal, draft)
      if (!draft.prompt) throw new Error(t('promptGen.empty'))
      if (withGreeting) {
        await streamInto(buildGreetingMessages(draft.prompt, name, locale), 'greeting', ctrl.signal, draft)
      }
      pushVersion(draft)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (err) {
      if (ctrl.signal.aborted) {
        if (draft.prompt.trim()) {
          pushVersion({
            prompt: cleanGenerated(draft.prompt),
            greeting: draft.greeting === null ? null : cleanGenerated(draft.greeting),
          })
        }
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

  const pushVersion = (version: Version) => {
    setIndex(versionCount.current)
    versionCount.current += 1
    setVersions((prev) => [...prev, version])
  }

  const editCurrent = (patch: Partial<Version>) => {
    setVersions((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  const stop = task.stop

  const revise = (text: string) => {
    if (!current || busy || !text.trim()) return
    setNote('')
    run({ draft: current.prompt, note: text })
  }

  const close = () => {
    stop()
    onClose()
  }

  const apply = () => {
    if (!current || busy) return
    onApply({ prompt: current.prompt.trim(), greeting: current.greeting?.trim() || null })
    setVersions([])
    setIndex(0)
    versionCount.current = 0
    setPhase('compose')
    setDescription('')
    setNote('')
    onClose()
  }

  const backToCompose = () => {
    stop()
    setError(null)
    setPhase('compose')
  }

  const words = current ? countWords(current.prompt) : 0
  const status = (() => {
    if (activity?.thinking) return t('promptGen.thinking', { secs: thinkingSecs })
    if (activity) return activity.target === 'prompt' ? t('promptGen.writingPrompt') : t('promptGen.writingGreeting')
    if (!current) return ''
    return `${words} ${plural(words, locale, ['слово', 'слова', 'слов'], ['word', 'words'])}`
  })()

  const column = wide ? styles.wideColumn : null

  const chip = (label: string, onPress: () => void, key?: string) => (
    <ShardChip key={key ?? label} label={label} active={false} onPress={() => !busy && onPress()} />
  )

  const choices = <T extends string>(value: T, options: { value: T; label: string }[], onChange: (v: T) => void) => (
    <View style={styles.chips}>
      {options.map((o) => (
        <ShardChip key={o.value} label={o.label} active={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  )

  const composeView = (
    <>
      {hasCurrent ? (
        <View style={styles.block}>
          {choices<Mode>(
            mode,
            [
              { value: 'improve', label: t('promptGen.modeImprove') },
              { value: 'new', label: t('promptGen.modeNew') },
            ],
            setMode
          )}
        </View>
      ) : null}

      <Eyebrow
        label={effectiveMode === 'improve' ? t('promptGen.changesLabel') : t('promptGen.descriptionLabel')}
        color={colors.accent}
      />
      <FieldRow
        value={description}
        onChangeText={setDescription}
        placeholder={effectiveMode === 'improve' ? t('promptGen.changesPlaceholder') : t('promptGen.placeholder')}
        hint={effectiveMode === 'improve' ? t('promptGen.improveHint') : t('promptGen.hint')}
        multiline
        minHeight={effectiveMode === 'improve' ? 96 : 140}
      />

      {effectiveMode === 'new' && !description.trim() ? (
        <View style={styles.block}>
          <Eyebrow label={t('promptGen.ideas')} color={colors.accent} />
          <View style={styles.chips}>{IDEA_KEYS.map((key) => chip(t(`${key}.title`), () => setDescription(t(key)), key))}</View>
        </View>
      ) : null}

      <Divider />

      <Eyebrow label={t('promptGen.lengthLabel')} color={colors.accent} />
      <View style={styles.block}>
        {choices<PromptLength>(
          length,
          [
            { value: 'short', label: t('promptGen.lengthShort') },
            { value: 'medium', label: t('promptGen.lengthMedium') },
            { value: 'long', label: t('promptGen.lengthLong') },
          ],
          setLength
        )}
      </View>

      <Eyebrow label={t('promptGen.formatLabel')} color={colors.accent} />
      <View style={styles.block}>
        {choices<PromptFormat>(
          format,
          [
            { value: 'prose', label: t('promptGen.formatProse') },
            { value: 'sections', label: t('promptGen.formatSections') },
          ],
          setFormat
        )}
      </View>

      <Divider />

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>{t('promptGen.withGreeting')}</Text>
          <Text style={styles.toggleHint}>
            {currentGreeting.trim() ? t('promptGen.withGreetingReplace') : t('promptGen.withGreetingHint')}
          </Text>
        </View>
        <StarToggle value={withGreeting} onValueChange={setWithGreeting} />
      </View>
    </>
  )

  const resultCard = (target: 'prompt' | 'greeting', label: string) => {
    const text = current?.[target] ?? ''
    const writing = activity?.target === target
    const waiting = busy && !writing && !text
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>{label}</Text>
          {writing ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </View>
        {busy || live ? (
          <Text style={[styles.resultText, !text && styles.resultPlaceholder]}>
            {text || (waiting ? t('promptGen.queued') : activity?.thinking ? t('promptGen.thinkingShort') : '')}
            {writing && text ? <Text style={{ color: colors.accent }}>{' ' + String.fromCharCode(0x258d)}</Text> : null}
          </Text>
        ) : (
          <TextInput
            value={text}
            onChangeText={(v) => editCurrent({ [target]: v })}
            multiline
            scrollEnabled={false}
            {...inputColors}
            onContentSizeChange={(e) => {
              const h = Math.ceil(e.nativeEvent.contentSize.height)
              setHeights((prev) => (prev[target] === h ? prev : { ...prev, [target]: h }))
            }}
            style={[styles.resultText, styles.resultInput, heights[target] ? { height: heights[target] } : null]}
          />
        )}
      </View>
    )
  }

  const resultView = (
    <>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{status}</Text>
        {versions.length > 1 && !busy ? (
          <Pager
            index={index}
            count={versions.length}
            onChange={setIndex}
            label={t('promptGen.version', { n: index + 1, total: versions.length })}
          />
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {current ? resultCard('prompt', t('editor.systemPromptLabel')) : null}
      {current && current.greeting !== null ? resultCard('greeting', t('editor.greetingLabel')) : null}

      {current && !busy ? (
        <View style={styles.block}>
          <Eyebrow label={t('promptGen.reviseLabel')} color={colors.accent} />
          <View style={styles.chips}>{TWEAK_KEYS.map((key) => chip(t(key), () => revise(t(`${key}.note`)), key))}</View>
          <View style={styles.noteRow}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('promptGen.revisePlaceholder')}
              {...inputColors}
              multiline
              style={styles.noteInput}
            />
            <Pressable
              onPress={() => revise(note)}
              disabled={!note.trim()}
              style={[styles.sendButton, !note.trim() && { backgroundColor: colors.borderStrong }]}
            >
              <Ionicons name="arrow-up" size={18} color={note.trim() ? '#fff' : colors.textFaint} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  )

  const footer =
    phase === 'compose' ? (
      <ShardButton
        label={effectiveMode === 'improve' ? t('promptGen.improve') : t('promptGen.generate')}
        onPress={() => run()}
        disabled={!canGenerate}
        color={colors.accent}
      />
    ) : busy ? (
      <ShardButton label={t('promptGen.stop')} onPress={stop} color={colors.danger} />
    ) : !current ? (
      <ShardButton label={t('promptGen.retry')} onPress={() => run()} color={colors.accent} />
    ) : (
      <View style={styles.footerRow}>
        <ShardButton label={t('promptGen.another')} onPress={() => run()} style={{ flex: 1 }} />
        <ShardButton
          label={hasCurrent ? t('promptGen.replace') : t('promptGen.apply')}
          onPress={apply}
          disabled={!current?.prompt.trim()}
          color={colors.accent}
          flip
          style={{ flex: 1 }}
        />
      </View>
    )

  return (
    <PageSheet
      visible={visible}
      onClose={close}
      title={t('promptGen.title')}
      left={
        <Pressable onPress={phase === 'result' ? backToCompose : close} hitSlop={10}>
          <Text style={styles.headerButton}>{phase === 'result' ? t('promptGen.back') : t('common.cancel')}</Text>
        </Pressable>
      }
      right={
        phase === 'result' ? (
          <Pressable onPress={close} hitSlop={10}>
            <Text style={styles.headerButton}>{t('common.close')}</Text>
          </Pressable>
        ) : null
      }
    >
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, column]}
      >
        {phase === 'compose' ? composeView : resultView}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={column}>{footer}</View>
      </View>
    </PageSheet>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    headerButton: { color: colors.textMuted, fontSize: 16 },
    content: { padding: 20, paddingBottom: 32 },
    wideColumn: { width: '100%', maxWidth: 720, alignSelf: 'center' },
    block: { marginBottom: 20 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    toggleTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    toggleHint: { color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 24,
      marginBottom: 12,
      marginHorizontal: 4,
    },
    metaText: { color: colors.textMuted, fontSize: 13 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      padding: 16,
      marginBottom: 16,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    cardLabel: { color: colors.accent, fontFamily: fonts.prose, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 },
    resultText: { color: colors.text, fontFamily: fonts.prose, fontSize: 16, lineHeight: 25 },
    resultPlaceholder: { color: colors.textFaint, fontStyle: 'italic' },
    resultInput: { padding: 0, textAlignVertical: 'top' },
    errorBox: {
      backgroundColor: colors.surface,
      padding: 14,
      marginBottom: 16,
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
    },
    errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    noteRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
    noteInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      maxHeight: 120,
    },
    sendButton: {
      width: 40,
      height: 40,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    footerRow: { flexDirection: 'row', gap: 14 },
  })
