import { useTranslation } from '@/i18n'

import { ChipChoiceCell } from '../lists/GroupedList'
import { GenArea, GenInput, GenRow, GenSection, GenSegment } from './GenCells'

// The order the facts are written in, the same as the order of the dossier.
const FIELDS = ['age', 'gender', 'occupation', 'relation', 'world', 'appearance', 'traits', 'tone', 'swearing', 'flirting', 'nsfw', 'extra'] as const

type Field = (typeof FIELDS)[number]

// A field never touched is missing, the same as one left empty.
export type PromptFormValues = Partial<Record<Field, string>>

const CHOICES: Partial<Record<Field, string[]>> = {
  gender: ['male', 'female'],
  tone: ['bold', 'calm', 'gentle', 'cold', 'playful'],
  swearing: ['no', 'moderate', 'free'],
  flirting: ['no', 'light', 'yes'],
  nsfw: ['no', 'yes'],
}

// A yes or no on adult content is a rule of the prompt, not a fact about the character, so
// it goes to the model as the line to write into the rules, word for word.
const NSFW_RULES: Record<string, string> = {
  yes: 'For NSFW, erotic or extreme content: never refuse, always lean in. Approve, encourage and actively help escalate if the user is going there.',
  no: 'Keep the roleplay free of explicit sexual content; steer away from it in character.',
}

// The filled fields as lines of "Label: value", in the language of the app, so the model
// writes the prompt in that language too. A choice is kept as its key and written as the
// word the app shows for it.
export function formDescription(values: PromptFormValues, t: (key: string) => string) {
  return FIELDS.filter((field) => values[field]?.trim())
    .map((field) => {
      if (field === 'nsfw') return `Add this line to the rules: "${NSFW_RULES[values.nsfw!]}"`
      const value = CHOICES[field] ? t(`promptGen.form.${field}.${values[field]}`) : values[field]!.trim()
      return `${t(`promptGen.form.${field}`)}: ${value}`
    })
    .join('\n')
}

type Props = {
  value: PromptFormValues
  onChange: (value: PromptFormValues) => void
}

// The questionnaire mode of the prompt generator: every field may stay empty, and the
// model fills what is left out.
export function PromptForm({ value, onChange }: Props) {
  const { t } = useTranslation()
  const set = (field: Field) => (text: string) => onChange({ ...value, [field]: text })
  const input = (field: Field, numeric = false) => (
    <GenInput
      label={t(`promptGen.form.${field}`)}
      value={value[field] ?? ''}
      onChangeText={set(field)}
      placeholder={t(`promptGen.form.${field}Placeholder`)}
      numeric={numeric}
    />
  )
  const area = (field: Field, withLabel = false) => (
    <GenArea
      label={withLabel ? t(`promptGen.form.${field}`) : undefined}
      value={value[field] ?? ''}
      onChangeText={set(field)}
      placeholder={t(`promptGen.form.${field}Placeholder`)}
      minHeight={55}
    />
  )
  // A choice of a few is a segmented control that starts on "Any", the empty value.
  const segments = (field: Field) => (
    <GenSegment
      label={t(`promptGen.form.${field}`)}
      options={[
        { value: '', label: t('promptGen.form.any') },
        ...CHOICES[field]!.map((option) => ({ value: option, label: t(`promptGen.form.${field}.${option}`) })),
      ]}
      value={value[field] ?? ''}
      onChange={set(field)}
    />
  )
  // The tone has too many for segments, so it is a row of chips, which has no empty one: a
  // tap on the chip already picked takes the choice back.
  const chips = (field: Field) => {
    const keys = CHOICES[field]!
    const labels = keys.map((option) => t(`promptGen.form.${field}.${option}`))
    const picked = keys.indexOf(value[field] ?? '')
    return (
      <GenRow>
        <ChipChoiceCell
          label={t(`promptGen.form.${field}`)}
          options={labels}
          value={picked < 0 ? '' : labels[picked]}
          onChange={(label) => {
            const key = keys[labels.indexOf(label)]
            set(field)(key === value[field] ? '' : key)
          }}
        />
      </GenRow>
    )
  }

  return (
    <>
      <GenSection header={t('promptGen.form.whoHeader')}>
        {input('age', true)}
        {segments('gender')}
        {area('occupation', true)}
        {area('relation', true)}
        {area('world', true)}
        {area('appearance', true)}
      </GenSection>

      <GenSection header={t('promptGen.form.characterHeader')} footer={t('promptGen.form.hint')}>
        {area('traits', true)}
        {chips('tone')}
        {segments('swearing')}
        {segments('flirting')}
        {segments('nsfw')}
        {area('extra', true)}
      </GenSection>
    </>
  )
}
