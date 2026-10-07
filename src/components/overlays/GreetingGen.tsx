import { useState } from 'react'

import { useTranslation } from '@/i18n'
import { buildGreetingMessages } from '@/lib/chat/promptGen'

import { AreaCell, ListFooter, ListSection, SwitchCell } from '../lists/GroupedList'
import { GenSheet, PresetChips } from './GenSheet'

type Props = {
  name: string
  systemPrompt: string
  currentGreeting: string
  onApply: (greeting: string) => void
}

const PRESET_KEYS = [
  'greetingGen.presetQuiet',
  'greetingGen.presetAction',
  'greetingGen.presetQuestion',
  'greetingGen.presetShort',
  'greetingGen.presetMood',
]
const TWEAK_KEYS = ['greetingGen.tweakShorter', 'greetingGen.tweakVivid', 'greetingGen.tweakAction']

// The character's first message, written from the system prompt: left to the model, or
// as the user describes it, presets filling in the description.
export function GreetingGen({ name, systemPrompt, currentGreeting, onApply }: Props) {
  const { t, locale } = useTranslation()
  const [free, setFree] = useState(true)
  const [wishes, setWishes] = useState('')

  // A preset is added to what is typed, so several can be put together.
  const addPreset = (key: string) => {
    const text = t(`${key}.note`)
    setWishes((prev) => (prev.trim() ? `${prev.trim().replace(/[.,;]$/, '')}, ${text}` : text))
  }

  // Both switches in one group, the description under them while it is wanted.
  const compose = (thinkingCell: React.ReactNode) => (
    <>
      <ListSection
        footer={
          <>
            {free ? <ListFooter>{t('greetingGen.freeHint')}</ListFooter> : null}
            <ListFooter>{t('gen.thinkingHint')}</ListFooter>
          </>
        }
      >
        <SwitchCell label={t('greetingGen.free')} value={free} onValueChange={setFree} />
        {thinkingCell}
      </ListSection>
      {free ? null : (
        <ListSection header={t('greetingGen.wishesLabel')} footer={t('greetingGen.wishesHint')}>
          <AreaCell value={wishes} onChangeText={setWishes} placeholder={t('greetingGen.wishesPlaceholder')} />
          <PresetChips items={PRESET_KEYS.map((key) => ({ key, label: t(key) }))} onPick={addPreset} />
        </ListSection>
      )}
    </>
  )

  return (
    <GenSheet
      title={t('greetingGen.title')}
      resultLabel={t('editor.greetingLabel')}
      current={currentGreeting}
      compose={compose}
      canGenerate={free || wishes.trim().length > 0}
      generateLabel={t('promptGen.generate')}
      build={(revision) => buildGreetingMessages(systemPrompt, name, locale, free ? '' : wishes, revision)}
      tweaks={TWEAK_KEYS}
      onApply={onApply}
    />
  )
}
