import { useState } from 'react'

import type { MessageImage } from '@/db/messages'
import { useTranslation } from '@/i18n'
import { buildPromptMessages, type PromptLength } from '@/lib/chat/promptGen'

import { AreaCell, ListSection, SegmentCell, SwitchCell } from '../lists/GroupedList'
import { GenImageAttachments } from './GenImageAttachments'
import { GenSheet, PresetChips } from './GenSheet'
import { formDescription, PromptForm, type PromptFormValues } from './PromptForm'

type Props = {
  name: string
  currentPrompt: string
  onApply: (prompt: string) => void
}

const IDEA_KEYS = ['promptGen.idea1', 'promptGen.idea2', 'promptGen.idea3', 'promptGen.idea4']
const TWEAK_KEYS = ['promptGen.tweakShorter', 'promptGen.tweakLonger', 'promptGen.tweakSpeech', 'promptGen.tweakVivid']

// The system prompt written from a description, or the one there is rewritten.
export function PromptGen({ name, currentPrompt, onApply }: Props) {
  const { t, locale } = useTranslation()
  const hasCurrent = currentPrompt.trim().length > 0
  // A character that already has a prompt most likely wants that prompt improved, not
  // replaced from scratch.
  const [improve, setImprove] = useState(hasCurrent)
  const [description, setDescription] = useState('')
  const [length, setLength] = useState<PromptLength>('medium')
  const [images, setImages] = useState<MessageImage[]>([])
  // The free description and the questionnaire keep what was typed in each while the user
  // switches between them.
  const [mode, setMode] = useState<'free' | 'form'>('free')
  const [form, setForm] = useState<PromptFormValues>({})

  const improving = hasCurrent && improve
  // An improvement edits the prompt there is, so the questionnaire is only for a new one.
  const fromForm = !improving && mode === 'form'
  const request = fromForm ? formDescription(form, t) : description

  // Improve or write anew, the description or the questionnaire, then the settings of the
  // request in one group.
  const compose = (thinkingCell: React.ReactNode) => (
    <>
      <ListSection>
        {hasCurrent ? <SwitchCell label={t('promptGen.improveCurrent')} value={improve} onValueChange={setImprove} /> : null}
        {improving ? null : (
          <SegmentCell
            label={t('promptGen.modeLabel')}
            options={[
              { value: 'free', label: t('promptGen.modeFree') },
              { value: 'form', label: t('promptGen.modeForm') },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
      </ListSection>

      {fromForm ? (
        <PromptForm value={form} onChange={setForm} />
      ) : (
        <ListSection
          header={improving ? t('promptGen.changesLabel') : t('promptGen.descriptionLabel')}
          footer={improving ? t('promptGen.improveHint') : t('promptGen.hint')}
        >
          <AreaCell
            value={description}
            onChangeText={setDescription}
            placeholder={improving ? t('promptGen.changesPlaceholder') : t('promptGen.placeholder')}
            minHeight={improving ? 66 : 110}
          />
          {!improving && !description.trim() ? (
            <PresetChips items={IDEA_KEYS.map((key) => ({ key, label: t(`${key}.title`) }))} onPick={(key) => setDescription(t(key))} />
          ) : null}
        </ListSection>
      )}

      <GenImageAttachments
        images={images}
        onImagesChange={setImages}
        header={t('promptGen.imagesLabel')}
        footer={t('promptGen.imagesHint')}
      />

      <ListSection footer={t('gen.thinkingHint')}>
        {/* An improvement edits the prompt as it is written, so its length stays. */}
        {improving ? null : (
          <SegmentCell
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
      </ListSection>
    </>
  )

  return (
    <GenSheet
      title={t('promptGen.title')}
      resultLabel={t('editor.systemPromptLabel')}
      current={currentPrompt}
      compose={compose}
      canGenerate={improving || request.trim().length > 0 || images.length > 0}
      generateLabel={improving ? t('promptGen.improve') : t('promptGen.generate')}
      build={(revision) =>
        buildPromptMessages(
          { description: request, name, base: improving ? currentPrompt : null, length, locale, images },
          revision
        )
      }
      edits={improving}
      tweaks={TWEAK_KEYS}
      onApply={onApply}
    />
  )
}
