import { useState } from 'react'

import type { MessageImage } from '@/db/messages'
import { useTranslation } from '@/i18n'
import {
  buildPersonaMessages,
  type PersonaFormat,
  type PersonaLength,
} from '@/lib/chat/promptGen'

import { AreaCell, ListSection, SegmentCell, SwitchCell } from '../lists/GroupedList'
import { GenImageAttachments } from './GenImageAttachments'
import { GenSheet, PresetChips } from './GenSheet'

type Props = {
  name: string
  currentDescription: string
  onApply: (description: string) => void
}

const IDEA_KEYS = ['personaGen.idea1', 'personaGen.idea2', 'personaGen.idea3', 'personaGen.idea4']
const TWEAK_KEYS = [
  'personaGen.tweakShorter',
  'personaGen.tweakLonger',
  'personaGen.tweakAppearance',
  'personaGen.tweakVivid',
]

// The user persona description written from a prompt, or the current one improved.
export function PersonaGen({ name, currentDescription, onApply }: Props) {
  const { t, locale } = useTranslation()
  const hasCurrent = currentDescription.trim().length > 0
  const [improve, setImprove] = useState(hasCurrent)
  const [description, setDescription] = useState('')
  const [length, setLength] = useState<PersonaLength>('medium')
  const [format, setFormat] = useState<PersonaFormat>('prose')
  const [images, setImages] = useState<MessageImage[]>([])

  const improving = hasCurrent && improve

  const compose = (thinkingCell: React.ReactNode) => (
    <>
      {hasCurrent ? (
        <ListSection>
          <SwitchCell
            label={t('personaGen.improveCurrent')}
            value={improve}
            onValueChange={setImprove}
          />
        </ListSection>
      ) : null}

      <ListSection
        header={improving ? t('promptGen.changesLabel') : t('persona.descriptionLabel')}
        footer={improving ? t('personaGen.improveHint') : t('personaGen.hint')}
      >
        <AreaCell
          value={description}
          onChangeText={setDescription}
          placeholder={improving ? t('personaGen.changesPlaceholder') : t('personaGen.placeholder')}
          minHeight={improving ? 66 : 110}
        />
        {!improving && !description.trim() ? (
          <PresetChips
            items={IDEA_KEYS.map((key) => ({ key, label: t(`${key}.title`) }))}
            onPick={(key) => setDescription(t(key))}
          />
        ) : null}
      </ListSection>

      <GenImageAttachments
        images={images}
        onImagesChange={setImages}
        header={t('personaGen.imagesLabel')}
        footer={t('personaGen.imagesHint')}
      />

      <ListSection footer={t('gen.thinkingHint')}>
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
      title={t('personaGen.title')}
      resultLabel={t('persona.descriptionLabel')}
      current={currentDescription}
      compose={compose}
      canGenerate={improving || description.trim().length > 0 || images.length > 0}
      generateLabel={improving ? t('promptGen.improve') : t('promptGen.generate')}
      build={(revision) =>
        buildPersonaMessages(
          {
            description,
            name,
            base: improving ? currentDescription : null,
            options: { length, format },
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
