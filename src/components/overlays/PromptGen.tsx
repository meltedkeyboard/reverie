import type { MessageImage } from '@/db/messages'
import { useGenInput } from '@/hooks/features/useGenSession'
import { useTranslation } from '@/i18n'
import { buildPromptMessages, type PromptLength } from '@/lib/chat/promptGen'

import { GenArea, GenSection, GenSegment, GenSwitch } from './GenCells'
import { GenImageAttachments } from './GenImageAttachments'
import { GenSheet, PresetChips } from './GenSheet'
import { formDescription, PromptForm, type PromptFormValues } from './PromptForm'

type Props = {
  name: string
  characterId: number | null
  currentPrompt: string
  currentGreeting: string
  onApply: (prompt: string) => void
}

type PromptMode = 'free' | 'form' | 'greeting'

const IDEA_KEYS = ['promptGen.idea1', 'promptGen.idea2', 'promptGen.idea3', 'promptGen.idea4']
const TWEAK_KEYS = ['promptGen.tweakShorter', 'promptGen.tweakLonger', 'promptGen.tweakSpeech', 'promptGen.tweakVivid']

// The system prompt written from a description, questionnaire or greeting, or the one
// there is rewritten.
export function PromptGen({ name, characterId, currentPrompt, currentGreeting, onApply }: Props) {
  const { t, locale } = useTranslation()
  const hasCurrent = currentPrompt.trim().length > 0
  const hasGreeting = currentGreeting.trim().length > 0
  // A character that already has a prompt most likely wants that prompt improved, not
  // replaced from scratch; one with only a greeting likely wants the prompt built around it.
  const [improve, setImprove] = useGenInput('improve', hasCurrent)
  const [description, setDescription] = useGenInput('description', '')
  const [customGreeting, setCustomGreeting] = useGenInput('customGreeting', false)
  const [greetingText, setGreetingText] = useGenInput('greetingText', '')
  const [greetingNotes, setGreetingNotes] = useGenInput('greetingNotes', '')
  const [length, setLength] = useGenInput<PromptLength>('length', 'medium')
  const [images, setImages] = useGenInput<MessageImage[]>('images', [])
  // Each mode keeps what was typed in it while the user switches between them.
  const [mode, setMode] = useGenInput<PromptMode>('mode', !hasCurrent && hasGreeting ? 'greeting' : 'free')
  const [form, setForm] = useGenInput<PromptFormValues>('form', {})

  const improving = hasCurrent && improve
  // An improvement edits the prompt there is, so creation modes apply only to a new one.
  const fromForm = !improving && mode === 'form'
  const fromGreeting = !improving && mode === 'greeting'
  const activeGreeting = customGreeting ? greetingText : currentGreeting
  const request = fromForm ? formDescription(form, t) : fromGreeting ? greetingNotes : description

  // Improve or write anew, the description, questionnaire or greeting, then the settings
  // of the request in one group.
  const compose = (thinkingCell: React.ReactNode) => (
    <>
      <GenSection>
        {hasCurrent ? <GenSwitch label={t('promptGen.improveCurrent')} value={improve} onValueChange={setImprove} /> : null}
        {improving ? null : (
          <GenSegment
            label={t('promptGen.modeLabel')}
            options={[
              { value: 'free', label: t('promptGen.modeFree') },
              { value: 'form', label: t('promptGen.modeForm') },
              { value: 'greeting', label: t('promptGen.modeGreeting') },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
      </GenSection>

      {fromForm ? (
        <PromptForm value={form} onChange={setForm} />
      ) : fromGreeting ? (
        <>
          <GenSection
            footer={
              customGreeting
                ? undefined
                : hasGreeting
                  ? t('promptGen.greetingFromEditorHint')
                  : [{ text: t('promptGen.noGreetingHint'), danger: true }]
            }
          >
            <GenSwitch label={t('promptGen.customGreeting')} value={customGreeting} onValueChange={setCustomGreeting} />
          </GenSection>
          {customGreeting ? (
            <GenSection header={t('promptGen.greetingLabel')} footer={t('promptGen.greetingHint')}>
              <GenArea
                value={greetingText}
                onChangeText={setGreetingText}
                placeholder={t('editor.greetingPlaceholder')}
                minHeight={110}
              />
            </GenSection>
          ) : null}
          <GenSection header={t('promptGen.greetingNotesLabel')} footer={t('promptGen.greetingNotesHint')}>
            <GenArea
              value={greetingNotes}
              onChangeText={setGreetingNotes}
              placeholder={t('promptGen.greetingNotesPlaceholder')}
              minHeight={66}
            />
          </GenSection>
        </>
      ) : (
        <GenSection
          header={improving ? t('promptGen.changesLabel') : t('promptGen.descriptionLabel')}
          footer={improving ? t('promptGen.improveHint') : t('promptGen.hint')}
        >
          <GenArea
            value={description}
            onChangeText={setDescription}
            placeholder={improving ? t('promptGen.changesPlaceholder') : t('promptGen.placeholder')}
            minHeight={improving ? 66 : 110}
          />
          {!improving && !description.trim() ? (
            <PresetChips items={IDEA_KEYS.map((key) => ({ key, label: t(`${key}.title`) }))} onPick={(key) => setDescription(t(key))} />
          ) : null}
        </GenSection>
      )}

      <GenImageAttachments
        characterId={characterId}
        images={images}
        onImagesChange={setImages}
        header={t('promptGen.imagesLabel')}
        footer={t('promptGen.imagesHint')}
      />

      <GenSection footer={t('gen.thinkingHint')}>
        {/* An improvement edits the prompt as it is written, so its length stays. */}
        {improving ? null : (
          <GenSegment
            label={t('promptGen.lengthLabel')}
            options={[
              { value: 'short', label: t('promptGen.lengthShort') },
              { value: 'medium', label: t('promptGen.lengthMedium') },
              { value: 'long', label: t('promptGen.lengthLong') },
            ]}
            value={length}
            onChange={setLength}
          />
        )}
        {thinkingCell}
      </GenSection>
    </>
  )

  return (
    <GenSheet
      title={t('promptGen.title')}
      resultLabel={t('editor.systemPromptLabel')}
      current={currentPrompt}
      compose={compose}
      canGenerate={improving || (fromGreeting ? activeGreeting.trim().length > 0 : request.trim().length > 0 || images.length > 0)}
      generateLabel={improving ? t('promptGen.improve') : t('promptGen.generate')}
      build={(revision) =>
        buildPromptMessages(
          {
            description: request,
            name,
            base: improving ? currentPrompt : null,
            greeting: fromGreeting ? activeGreeting : null,
            length,
            locale,
            images,
          },
          revision
        )
      }
      edits={improving}
      tweaks={TWEAK_KEYS}
      onApply={onApply}
    />
  )
}
