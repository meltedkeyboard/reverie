import { useState } from 'react'

import { useTranslation } from '@/i18n'
import { buildPromptMessages, type PromptFormat, type PromptLength } from '@/lib/chat/promptGen'

import { AreaCell, ListSection, SegmentCell, SwitchCell } from '../lists/GroupedList'
import { GenSheet, PresetChips } from './GenSheet'

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
  const [format, setFormat] = useState<PromptFormat>('prose')

  const improving = hasCurrent && improve

  // Improve or write anew, the description, then the settings of the request in one group.
  const compose = (thinkingCell: React.ReactNode) => (
    <>
      {hasCurrent ? (
        <ListSection>
          <SwitchCell label={t('promptGen.improveCurrent')} value={improve} onValueChange={setImprove} />
        </ListSection>
      ) : null}

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

      <ListSection footer={t('gen.thinkingHint')}>
        {/* An improvement edits the prompt as it is written, so its length and layout stay. */}
        {improving ? null : (
          <>
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
            <SegmentCell
              label={t('promptGen.formatLabel')}
              options={[
                { value: 'prose', label: t('promptGen.formatProse') },
                { value: 'sections', label: t('promptGen.formatSections') },
              ]}
              value={format}
              onChange={setFormat}
            />
          </>
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
      canGenerate={improving || description.trim().length > 0}
      generateLabel={improving ? t('promptGen.improve') : t('promptGen.generate')}
      build={(revision) =>
        buildPromptMessages(
          { description, name, base: improving ? currentPrompt : null, options: { length, format }, locale },
          revision
        )
      }
      edits={improving}
      tweaks={TWEAK_KEYS}
      onApply={onApply}
    />
  )
}
