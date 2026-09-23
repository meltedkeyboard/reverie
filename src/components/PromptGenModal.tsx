import Ionicons from '@expo/vector-icons/Ionicons'
import { useSQLiteContext } from 'expo-sqlite'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { ChatTurn } from '@/api/llm'
import { loadSettings } from '@/db/settings'
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
import { fonts, useStyles, useTheme, type Colors } from '@/theme'

import { Button } from './Button'
import { PageSheet } from './PageSheet'
import { Segmented } from './Segmented'

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
  const { colors, scheme } = useTheme()
  const styles = useStyles(createStyles)
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
  const [, setTick] = useState(0)
  // A multiline TextInput doesn't grow with its text on web, so the height is set by hand.
  const [heights, setHeights] = useState<Partial<Record<'prompt' | 'greeting', number>>>({})
  const abortRef = useRef<AbortController | null>(null)
  const versionCount = useRef(0)

  const hasCurrent = currentPrompt.trim().length > 0
  const busy = activity !== null
  const current = live ?? versions[index] ?? null

  // Opening the sheet on a character that already has a prompt most likely means
  // the user wants that prompt improved, not replaced from scratch.
  useEffect(() => {
    if (visible && phase === 'compose' && !description) setMode(hasCurrent ? 'improve' : 'new')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    if (!activity?.thinking) return
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [activity?.thinking])

  useEffect(() => () => abortRef.current?.abort(), [])

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
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
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
      if (abortRef.current === ctrl) {
        abortRef.current = null
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

  const stop = () => abortRef.current?.abort()

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
    if (activity?.thinking) {
      const secs = Math.floor((Date.now() - activity.since) / 1000)
      return t('promptGen.thinking', { secs })
    }
    if (activity) return activity.target === 'prompt' ? t('promptGen.writingPrompt') : t('promptGen.writingGreeting')
    if (!current) return ''
    return `${words} ${plural(words, locale, ['слово', 'слова', 'слов'], ['word', 'words'])}`
  })()

  const column = wide ? styles.wideColumn : null

  const chip = (label: string, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }, busy && { opacity: 0.4 }]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  )

  const composeView = (
    <>
      {hasCurrent ? (
        <View style={styles.block}>
          <Segmented<Mode>
            value={mode}
            options={[
              { value: 'improve', label: t('promptGen.modeImprove') },
              { value: 'new', label: t('promptGen.modeNew') },
            ]}
            onChange={setMode}
          />
        </View>
      ) : null}

      <Text style={styles.label}>
        {effectiveMode === 'improve' ? t('promptGen.changesLabel') : t('promptGen.descriptionLabel')}
      </Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={effectiveMode === 'improve' ? t('promptGen.changesPlaceholder') : t('promptGen.placeholder')}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        keyboardAppearance={scheme}
        multiline
        style={[styles.input, effectiveMode === 'improve' && { minHeight: 96 }]}
      />
      <Text style={styles.hint}>
        {effectiveMode === 'improve' ? t('promptGen.improveHint') : t('promptGen.hint')}
      </Text>

      {effectiveMode === 'new' && !description.trim() ? (
        <View style={styles.block}>
          <Text style={styles.label}>{t('promptGen.ideas')}</Text>
          <View style={styles.chips}>{IDEA_KEYS.map((key) => chip(t(`${key}.title`), () => setDescription(t(key)), key))}</View>
        </View>
      ) : null}

      <Text style={styles.label}>{t('promptGen.lengthLabel')}</Text>
      <View style={styles.block}>
        <Segmented<PromptLength>
          value={length}
          options={[
            { value: 'short', label: t('promptGen.lengthShort') },
            { value: 'medium', label: t('promptGen.lengthMedium') },
            { value: 'long', label: t('promptGen.lengthLong') },
          ]}
          onChange={setLength}
        />
      </View>

      <Text style={styles.label}>{t('promptGen.formatLabel')}</Text>
      <View style={styles.block}>
        <Segmented<PromptFormat>
          value={format}
          options={[
            { value: 'prose', label: t('promptGen.formatProse') },
            { value: 'sections', label: t('promptGen.formatSections') },
          ]}
          onChange={setFormat}
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>{t('promptGen.withGreeting')}</Text>
          <Text style={styles.toggleHint}>
            {currentGreeting.trim() ? t('promptGen.withGreetingReplace') : t('promptGen.withGreetingHint')}
          </Text>
        </View>
        <Switch
          value={withGreeting}
          onValueChange={setWithGreeting}
          trackColor={{ true: colors.accent, false: colors.textFaint }}
        />
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
            selectionColor={colors.accent}
            keyboardAppearance={scheme}
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
          <View style={styles.versionNav}>
            <Pressable onPress={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} hitSlop={8}>
              <Ionicons name="chevron-back" size={18} color={index === 0 ? colors.textFaint : colors.text} />
            </Pressable>
            <Text style={styles.metaText}>{t('promptGen.version', { n: index + 1, total: versions.length })}</Text>
            <Pressable
              onPress={() => setIndex((i) => Math.min(versions.length - 1, i + 1))}
              disabled={index === versions.length - 1}
              hitSlop={8}
            >
              <Ionicons name="chevron-forward" size={18} color={index === versions.length - 1 ? colors.textFaint : colors.text} />
            </Pressable>
          </View>
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
          <Text style={styles.label}>{t('promptGen.reviseLabel')}</Text>
          <View style={styles.chips}>{TWEAK_KEYS.map((key) => chip(t(key), () => revise(t(`${key}.note`)), key))}</View>
          <View style={styles.noteRow}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('promptGen.revisePlaceholder')}
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              keyboardAppearance={scheme}
              multiline
              style={styles.noteInput}
            />
            <Pressable
              onPress={() => revise(note)}
              disabled={!note.trim()}
              style={[styles.sendButton, !note.trim() && { backgroundColor: colors.surfaceRaised }]}
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
      <Button
        icon="sparkles"
        label={effectiveMode === 'improve' ? t('promptGen.improve') : t('promptGen.generate')}
        onPress={() => run()}
        disabled={!canGenerate}
      />
    ) : busy ? (
      <Button variant="secondary" icon="stop" label={t('promptGen.stop')} onPress={stop} />
    ) : !current ? (
      <Button icon="refresh" label={t('promptGen.retry')} onPress={() => run()} />
    ) : (
      <View style={styles.footerRow}>
        <Button variant="secondary" icon="refresh" label={t('promptGen.another')} onPress={() => run()} />
        <View style={{ flex: 1 }}>
          <Button
            icon="checkmark"
            label={hasCurrent ? t('promptGen.replace') : t('promptGen.apply')}
            onPress={apply}
            disabled={!current?.prompt.trim()}
          />
        </View>
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
    label: { color: colors.textMuted, fontSize: 13, marginBottom: 8, marginLeft: 4 },
    hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: 6, marginLeft: 4, marginBottom: 20 },
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
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
    },
    chipText: { color: colors.accent, fontSize: 14 },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surfaceRaised,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    toggleTitle: { color: colors.text, fontSize: 15 },
    toggleHint: { color: colors.textFaint, fontSize: 12, marginTop: 2, lineHeight: 16 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 24,
      marginBottom: 12,
      marginHorizontal: 4,
    },
    metaText: { color: colors.textMuted, fontSize: 13 },
    versionNav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    card: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    cardLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    resultText: { color: colors.text, fontFamily: fonts.prose, fontSize: 16, lineHeight: 25 },
    resultPlaceholder: { color: colors.textFaint, fontStyle: 'italic' },
    resultInput: { padding: 0, textAlignVertical: 'top' },
    errorBox: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
    },
    errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    noteRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
    noteInput: {
      flex: 1,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
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
      borderRadius: 20,
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
    footerRow: { flexDirection: 'row', gap: 10 },
  })
