import type { MessageImage } from '@/db/messages'
import { useGenInput } from '@/hooks/features/useGenSession'
import { useTranslation } from '@/i18n'
import { buildGreetingMessages } from '@/lib/chat/promptGen'

import { GenArea, GenSection, GenSwitch } from './GenCells'
import { GenImageAttachments } from './GenImageAttachments'
import { GenSheet, PresetChips } from './GenSheet'

type Props = {
  name: string
  characterId: number | null
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
export function GreetingGen({ name, characterId, systemPrompt, currentGreeting, onApply }: Props) {
  const { t, locale } = useTranslation()
  const [free, setFree] = useGenInput('free', true)
  const [wishes, setWishes] = useGenInput('wishes', '')
  const [images, setImages] = useGenInput<MessageImage[]>('images', [])

  // A preset is added to what is typed, so several can be put together.
  const addPreset = (key: string) => {
    const text = t(`${key}.note`)
    setWishes((prev) => (prev.trim() ? `${prev.trim().replace(/[.,;]$/, '')}, ${text}` : text))
  }

  const handleImagesChange = (next: MessageImage[]) => {
    setImages(next)
    if (next.length > 0 && free) {
      setFree(false)
    }
  }

  // Both switches in one group, the description under them while it is wanted.
  const compose = (thinkingCell: React.ReactNode) => (
    <>
      <GenSection
        footer={[...(free ? [{ text: t('greetingGen.freeHint') }] : []), { text: t('gen.thinkingHint') }]}
      >
        <GenSwitch label={t('greetingGen.free')} value={free} onValueChange={setFree} />
        {thinkingCell}
      </GenSection>
      {free ? null : (
        <GenSection header={t('greetingGen.wishesLabel')} footer={t('greetingGen.wishesHint')}>
          <GenArea value={wishes} onChangeText={setWishes} placeholder={t('greetingGen.wishesPlaceholder')} />
          <PresetChips items={PRESET_KEYS.map((key) => ({ key, label: t(key) }))} onPick={addPreset} />
        </GenSection>
      )}
      <GenImageAttachments
        characterId={characterId}
        images={images}
        onImagesChange={handleImagesChange}
        header={t('greetingGen.imagesLabel')}
        footer={t('greetingGen.imagesHint')}
      />
    </>
  )

  return (
    <GenSheet
      title={t('greetingGen.title')}
      resultLabel={t('editor.greetingLabel')}
      current={currentGreeting}
      compose={compose}
      canGenerate={free || wishes.trim().length > 0 || images.length > 0}
      generateLabel={t('promptGen.generate')}
      build={(revision) =>
        buildGreetingMessages(systemPrompt, name, locale, free ? '' : wishes, revision, images)
      }
      tweaks={TWEAK_KEYS}
      onApply={onApply}
    />
  )
}
