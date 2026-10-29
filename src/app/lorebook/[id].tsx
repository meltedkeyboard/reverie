import { useLocalSearchParams, useRouter } from 'expo-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { CastMosaic } from '@/components/cast/CastMosaic'
import { BarButton, DrawnFormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, InputCell, ListFooter, ListSection, SliderCell, SwitchCell, TextCell } from '@/components/lists/GroupedList'
import {
  NativeActionRow,
  NativeForm,
  NativeFreeSliderRow,
  NativeHostedRow,
  NativeSection,
  NativeSliderRow,
  NativeTextRow,
  nativeForm,
} from '@/components/lists/NativeForm'
import { Avatar } from '@/components/visuals/Avatar'
import { Icon } from '@/components/visuals/Icon'
import { listCharacters } from '@/db/characters'
import {
  DEFAULT_LOREBOOK,
  deleteLorebook,
  getLorebook,
  LORE_BUDGET,
  LORE_SCAN,
  saveLorebook,
  type LoreEntryFields,
  type LorebookFields,
  type LoreLinks,
} from '@/db/lorebooks'
import { useDatabase } from '@/db/provider'
import { listRooms } from '@/db/rooms'
import { useTranslation } from '@/i18n'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { alertError } from '@/lib/transfer/report'
import { type Colors, HEADER_ROW_HEIGHT, useColors, useStyles } from '@/theme'

// An entry being edited, with a key of its own for the list while it has no id.
type Entry = LoreEntryFields & { key: number }

// A character with their photo, or a room with its cast, whose faces stand for it as elsewhere.
type Owner = { id: number; name: string; avatar?: string | null; cast?: { name: string; avatar: string | null }[] }

const AVATAR = 30
// The rooms tab's symbol, which stands for the word before a room's name.
const ROOM_SYMBOL = 'bubble.left.and.bubble.right'

// A lorebook: its name, who uses it, its entries (each opening its own rows, as a room's
// members do) and how much of the talk it reads and how much of the prompt it may take.
export default function LorebookEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()

  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState<LorebookFields>(DEFAULT_LOREBOOK)
  const [entries, setEntries] = useState<Entry[]>([])
  const [links, setLinks] = useState<LoreLinks>({ characterIds: [], roomIds: [] })
  const [characters, setCharacters] = useState<Owner[]>([])
  const [rooms, setRooms] = useState<Owner[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const nextKey = useRef(1)

  const set = <K extends keyof LorebookFields>(key: K, value: LorebookFields[K]) => setFields((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    ;(async () => {
      setCharacters((await listCharacters(db, 'all')).map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })))
      setRooms((await listRooms(db)).map((r) => ({ id: r.id, name: r.name, cast: r.cast })))
      if (!isNew) {
        const found = await getLorebook(db, Number(id))
        if (!found) return router.back()
        const { id: _id, createdAt: _createdAt, ...rest } = found.book
        setFields(rest)
        setEntries(found.entries.map(({ id: _entryId, ...entry }) => ({ ...entry, key: nextKey.current++ })))
        setLinks(found.links)
      }
      setReady(true)
    })()
  }, [db, id, isNew, router])

  const canSave = ready && !saving && fields.name.trim().length > 0

  const updateEntry = (key: number, patch: Partial<LoreEntryFields>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)))

  const addEntry = () => {
    const key = nextKey.current++
    setEntries((list) => [...list, { key, keys: '', content: '', always: false, enabled: true }])
    setExpanded(key)
  }

  const removeEntry = (key: number) => {
    setEntries((list) => list.filter((e) => e.key !== key))
    setExpanded(null)
  }

  const toggleLink = (kind: 'characterIds' | 'roomIds', ownerId: number, on: boolean) =>
    setLinks((l) => ({ ...l, [kind]: on ? [...l[kind], ownerId] : l[kind].filter((x) => x !== ownerId) }))

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await saveLorebook(
        db,
        isNew ? null : Number(id),
        fields,
        entries.filter((e) => e.content.trim()).map(({ key: _key, ...entry }) => entry),
        links
      )
      router.back()
    } catch (err) {
      setSaving(false)
      alertError(t('editor.saveFailedTitle'), err)
    }
  }

  const confirmDelete = () => {
    confirmDeletion({
      title: t('lore.delete'),
      message: t('lore.deleteConfirm', { name: fields.name }),
      onConfirm: async () => {
        await deleteLorebook(db, Number(id))
        router.back()
      },
    })
  }

  // An entry's row, which opens its own rows under it: its keys, or that it is always in,
  // over the start of its text.
  const entryHead = (entry: Entry, open: boolean) => {
    const keys = entry.always ? t('lore.always') : entry.keys.trim() || t('lore.noKeys')
    return (
      <Pressable
        onPress={() => setExpanded(open ? null : entry.key)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.entryHead, pressed && !nativeForm && styles.pressed]}
      >
        <View style={styles.entryBody}>
          <Text style={[styles.entryKeys, !entry.enabled && styles.off]} numberOfLines={1}>
            {keys}
          </Text>
          <Text style={styles.entryText} numberOfLines={1}>
            {entry.content.trim() || t('lore.emptyEntry')}
          </Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
      </Pressable>
    )
  }

  const contentText = (entry: Entry) => (
    <TextCell
      title={t('lore.content')}
      value={entry.content}
      placeholder={t('lore.contentPlaceholder')}
      onChangeText={(v) => updateEntry(entry.key, { content: v })}
      lines={3}
    />
  )

  // A tap on the photo opens it in the viewer; the switch is toggled by the switch alone.
  const ownerPhoto = (owner: Owner) =>
    owner.cast ? (
      <CastMosaic cast={owner.cast} name={owner.name} size={AVATAR} round viewable />
    ) : (
      <Avatar name={owner.name} file={owner.avatar} size={AVATAR} />
    )

  const entryOpen = entries.some((e) => e.key === expanded)
  const entriesFooter = entryOpen ? [t('lore.keysHint'), t('lore.alwaysHint')] : [entries.length ? t('lore.entriesHint') : t('lore.noEntries')]
  const tokens = (v: number) => String(v)

  const renderNative = ({ ui }: NonNullable<typeof nativeForm>) => (
    <NativeForm>
      <NativeSection inset={HEADER_ROW_HEIGHT}>
        <NativeTextRow label={t('lore.name')} value={fields.name} onChangeText={(v) => set('name', v)} placeholder={t('lore.namePlaceholder')} />
      </NativeSection>

      <NativeSection title={t('lore.entries')} footer={entriesFooter.map((text) => ({ text }))}>
        {entries.map((entry) => {
          const open = expanded === entry.key
          return (
            <Fragment key={entry.key}>
              {/* A new view whenever an entry opens or closes, as the members of a room. */}
              <NativeHostedRow key={`${expanded}`}>{entryHead(entry, open)}</NativeHostedRow>
              {open ? (
                <>
                  <NativeTextRow
                    label={t('lore.keys')}
                    value={entry.keys}
                    onChangeText={(v) => updateEntry(entry.key, { keys: v })}
                    placeholder={t('lore.keysPlaceholder')}
                  />
                  <NativeHostedRow key={`content${expanded}`}>{contentText(entry)}</NativeHostedRow>
                  <ui.Toggle label={t('lore.alwaysLabel')} isOn={entry.always} onIsOnChange={(v) => updateEntry(entry.key, { always: v })} />
                  <ui.Toggle label={t('lore.enabled')} isOn={entry.enabled} onIsOnChange={(v) => updateEntry(entry.key, { enabled: v })} />
                  <NativeActionRow label={t('lore.removeEntry')} destructive onPress={() => removeEntry(entry.key)} />
                </>
              ) : null}
            </Fragment>
          )
        })}
        <NativeActionRow label={t('lore.addEntry')} onPress={addEntry} />
      </NativeSection>

      <NativeSection title={t('lore.usedBy')} footer={t('lore.usedByHint')}>
        {characters.map((c) => (
          // The photo goes into the toggle's own label, so the switch stays the system's.
          <ui.Toggle key={`c${c.id}`} isOn={links.characterIds.includes(c.id)} onIsOnChange={(v) => toggleLink('characterIds', c.id, v)}>
            <ui.HStack spacing={12}>
              <ui.RNHostView matchContents>{ownerPhoto(c)}</ui.RNHostView>
              <ui.Text>{c.name}</ui.Text>
            </ui.HStack>
          </ui.Toggle>
        ))}
        {rooms.map((r) => (
          <ui.Toggle key={`r${r.id}`} isOn={links.roomIds.includes(r.id)} onIsOnChange={(v) => toggleLink('roomIds', r.id, v)}>
            <ui.HStack spacing={12}>
              <ui.RNHostView matchContents>{ownerPhoto(r)}</ui.RNHostView>
              {/* The rooms tab's symbol in place of the word, in the name's own color. */}
              <ui.HStack spacing={6}>
                <ui.Image systemName={ROOM_SYMBOL} size={15} color={colors.text} />
                <ui.Text>{r.name}</ui.Text>
              </ui.HStack>
            </ui.HStack>
          </ui.Toggle>
        ))}
      </NativeSection>

      <NativeSection footer={[{ text: t('lore.scanHint') }, { text: t('lore.budgetHint') }]}>
        <NativeSliderRow
          label={t('lore.scanDepth')}
          value={fields.scanDepth}
          min={LORE_SCAN.min}
          max={LORE_SCAN.max}
          step={LORE_SCAN.step}
          onChange={(v) => set('scanDepth', Math.round(v))}
        />
        <NativeFreeSliderRow
          label={t('lore.budget')}
          value={fields.budget}
          min={LORE_BUDGET.min}
          max={LORE_BUDGET.max}
          step={LORE_BUDGET.step}
          format={tokens}
          onChange={(v) => set('budget', Math.round(v))}
        />
      </NativeSection>

      {!isNew ? (
        <NativeSection>
          <NativeActionRow label={t('lore.delete')} destructive onPress={confirmDelete} />
        </NativeSection>
      ) : null}
    </NativeForm>
  )

  return (
    <View style={styles.screen}>
      {ready && nativeForm ? (
        renderNative(nativeForm)
      ) : ready ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          <ListSection>
            <InputCell label={t('lore.name')} value={fields.name} onChangeText={(v) => set('name', v)} placeholder={t('lore.namePlaceholder')} />
          </ListSection>

          <ListSection
            header={t('lore.entries')}
            footer={
              <>
                {entriesFooter.map((text) => (
                  <ListFooter key={text}>{text}</ListFooter>
                ))}
              </>
            }
          >
            {entries.map((entry) => {
              const open = expanded === entry.key
              return (
                <Fragment key={entry.key}>
                  {entryHead(entry, open)}
                  {open ? (
                    <>
                      <InputCell
                        label={t('lore.keys')}
                        value={entry.keys}
                        onChangeText={(v) => updateEntry(entry.key, { keys: v })}
                        placeholder={t('lore.keysPlaceholder')}
                      />
                      {contentText(entry)}
                      <SwitchCell label={t('lore.alwaysLabel')} value={entry.always} onValueChange={(v) => updateEntry(entry.key, { always: v })} />
                      <SwitchCell label={t('lore.enabled')} value={entry.enabled} onValueChange={(v) => updateEntry(entry.key, { enabled: v })} />
                      <ButtonCell danger label={t('lore.removeEntry')} onPress={() => removeEntry(entry.key)} />
                    </>
                  ) : null}
                </Fragment>
              )
            })}
            <ButtonCell label={t('lore.addEntry')} onPress={addEntry} />
          </ListSection>

          <ListSection header={t('lore.usedBy')} footer={t('lore.usedByHint')}>
            {characters.map((c) => (
              <SwitchCell
                key={`c${c.id}`}
                label={c.name}
                leading={ownerPhoto(c)}
                value={links.characterIds.includes(c.id)}
                onValueChange={(v) => toggleLink('characterIds', c.id, v)}
              />
            ))}
            {rooms.map((r) => (
              <SwitchCell
                key={`r${r.id}`}
                label={r.name}
                leading={ownerPhoto(r)}
                labelIcon={<Icon name="chatbubbles-outline" size={17} color={colors.text} />}
                value={links.roomIds.includes(r.id)}
                onValueChange={(v) => toggleLink('roomIds', r.id, v)}
              />
            ))}
          </ListSection>

          <ListSection
            footer={
              <>
                <ListFooter>{t('lore.scanHint')}</ListFooter>
                <ListFooter>{t('lore.budgetHint')}</ListFooter>
              </>
            }
          >
            <SliderCell
              label={t('lore.scanDepth')}
              value={fields.scanDepth}
              min={LORE_SCAN.min}
              max={LORE_SCAN.max}
              step={LORE_SCAN.step}
              onChange={(v) => set('scanDepth', v)}
            />
            <SliderCell
              label={t('lore.budget')}
              value={fields.budget}
              min={LORE_BUDGET.min}
              max={LORE_BUDGET.max}
              step={LORE_BUDGET.step}
              onChange={(v) => set('budget', v)}
            />
          </ListSection>

          {!isNew ? (
            <ListSection>
              <ButtonCell danger label={t('lore.delete')} onPress={confirmDelete} />
            </ListSection>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}

      <DrawnFormScreenHeader
        title={isNew ? t('lore.new') : fields.name.trim() || t('lore.untitled')}
        right={
          <BarButton symbol="checkmark" fallback="checkmark" disabled={!canSave} onPress={onSave} accessibilityLabel={t('common.save')} prominent />
        }
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    pressed: { backgroundColor: colors.surfaceRaised },
    entryHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    entryBody: { flex: 1 },
    entryKeys: { color: colors.text, fontSize: 16, fontWeight: '600' },
    off: { color: colors.textFaint },
    entryText: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  })
