import { useGenInput } from '@/hooks/features/useGenSession'
import { useTranslation } from '@/i18n'
import {
  buildOpeningMessages,
  buildScenarioMessages,
  buildSetupMessages,
  castWithNamed,
  setupExample,
  type GenCastMember,
} from '@/lib/chat/room/roomGen'

import { GenArea, GenSection, GenSwitch } from './GenCells'
import { GenSheet, PresetChips } from './GenSheet'

const SETUP_TWEAKS = ['roomGen.tweakCalmer', 'roomGen.tweakLively', 'roomGen.tweakConflict', 'roomGen.tweakShorter']
const SCENARIO_TWEAKS = ['promptGen.tweakShorter', 'roomGen.tweakRelations', 'roomGen.tweakConflict']
const OPENING_PRESETS = [
  'greetingGen.presetQuiet',
  'greetingGen.presetAction',
  'greetingGen.presetShort',
  'greetingGen.presetMood',
]
const OPENING_TWEAKS = ['greetingGen.tweakShorter', 'greetingGen.tweakVivid', 'greetingGen.tweakAction']

// The whole room from a few words: who is there and how they get on. The model writes a
// setup sheet, which the editor reads back into the room's fields and every member's
// numbers; characters of the user's list named in the words join the room.
export function RoomSetupGen({
  cast,
  library,
  currentSetup,
  onApply,
}: {
  cast: GenCastMember[]
  library: GenCastMember[]
  currentSetup: string
  onApply: (setup: string) => void
}) {
  const { t, locale } = useTranslation()
  const hasCurrent = currentSetup.trim().length > 0
  const [improve, setImprove] = useGenInput('improve', false)
  const [description, setDescription] = useGenInput('description', '')

  const improving = hasCurrent && improve
  const everyone = castWithNamed(cast, library, description)
  const names = everyone.map((member) =>
    cast.includes(member) ? member.name : t('roomGen.joins', { name: member.name })
  )

  const compose = (thinkingCell: React.ReactNode) => (
    <>
      {hasCurrent ? (
        <GenSection>
          <GenSwitch label={t('roomGen.improveCurrent')} value={improve} onValueChange={setImprove} />
        </GenSection>
      ) : null}

      <GenSection
        header={improving ? t('promptGen.changesLabel') : t('roomGen.descriptionLabel')}
        footer={[
          { text: improving ? t('roomGen.improveHint') : t('roomGen.hint') },
          names.length
            ? { text: t('roomGen.castLine', { names: names.join(', ') }) }
            : { text: t('roomGen.noCast'), danger: true },
          ...(library.length ? [{ text: t('roomGen.namedHint') }] : []),
        ]}
      >
        <GenArea
          value={description}
          onChangeText={setDescription}
          placeholder={improving ? t('roomGen.changesPlaceholder') : t('roomGen.placeholder')}
          minHeight={improving ? 66 : 132}
        />
        {/* The sample of how to put it: the same words the model is shown with the sheet
            they become. */}
        {!improving && !description.trim() ? (
          <PresetChips items={[{ key: 'example', label: t('roomGen.example') }]} onPick={() => setDescription(setupExample(locale))} />
        ) : null}
      </GenSection>

      <GenSection footer={t('gen.thinkingHint')}>{thinkingCell}</GenSection>
    </>
  )

  return (
    <GenSheet
      title={t('roomGen.setupTitle')}
      resultLabel={t('roomGen.setupResult')}
      current={currentSetup}
      compose={compose}
      canGenerate={everyone.length > 0 && (improving || description.trim().length > 0)}
      generateLabel={improving ? t('promptGen.improve') : t('promptGen.generate')}
      build={(revision) =>
        buildSetupMessages({ description, cast: everyone, base: improving ? currentSetup : null, locale }, revision)
      }
      edits={improving}
      tweaks={SETUP_TWEAKS}
      onApply={onApply}
    />
  )
}

// The scene description every member is told, from what the user wants and who is in the
// room, or the one there is improved.
export function ScenarioGen({
  cast,
  currentScenario,
  onApply,
}: {
  cast: GenCastMember[]
  currentScenario: string
  onApply: (scenario: string) => void
}) {
  const { t, locale } = useTranslation()
  const hasCurrent = currentScenario.trim().length > 0
  const [improve, setImprove] = useGenInput('improve', hasCurrent)
  const [description, setDescription] = useGenInput('description', '')

  const improving = hasCurrent && improve

  const compose = (thinkingCell: React.ReactNode) => (
    <>
      {hasCurrent ? (
        <GenSection>
          <GenSwitch label={t('roomGen.improveScenario')} value={improve} onValueChange={setImprove} />
        </GenSection>
      ) : null}

      <GenSection
        header={improving ? t('promptGen.changesLabel') : t('roomGen.scenarioLabel')}
        footer={improving ? t('roomGen.scenarioImproveHint') : t('roomGen.scenarioHint')}
      >
        <GenArea
          value={description}
          onChangeText={setDescription}
          placeholder={improving ? t('roomGen.scenarioChangesPlaceholder') : t('roomGen.scenarioPlaceholder')}
          minHeight={improving ? 66 : 110}
        />
      </GenSection>

      <GenSection footer={t('gen.thinkingHint')}>{thinkingCell}</GenSection>
    </>
  )

  return (
    <GenSheet
      title={t('roomGen.scenarioTitle')}
      resultLabel={t('roomEditor.scenario')}
      current={currentScenario}
      compose={compose}
      canGenerate={improving || description.trim().length > 0 || cast.length > 0}
      generateLabel={improving ? t('promptGen.improve') : t('promptGen.generate')}
      build={(revision) =>
        buildScenarioMessages({ description, cast, base: improving ? currentScenario : null, locale }, revision)
      }
      edits={improving}
      tweaks={SCENARIO_TWEAKS}
      onApply={onApply}
    />
  )
}

// The narration a new scene opens with, from the scene description: left to the model, or
// as the user describes it, as a character's greeting is.
export function OpeningGen({
  cast,
  scenario,
  currentOpening,
  onApply,
}: {
  cast: GenCastMember[]
  scenario: string
  currentOpening: string
  onApply: (opening: string) => void
}) {
  const { t, locale } = useTranslation()
  const [free, setFree] = useGenInput('free', true)
  const [wishes, setWishes] = useGenInput('wishes', '')

  const addPreset = (key: string) => {
    const text = t(`${key}.note`)
    setWishes((prev) => (prev.trim() ? `${prev.trim().replace(/[.,;]$/, '')}, ${text}` : text))
  }

  const compose = (thinkingCell: React.ReactNode) => (
    <>
      <GenSection footer={[...(free ? [{ text: t('roomGen.openingFreeHint') }] : []), { text: t('gen.thinkingHint') }]}>
        <GenSwitch label={t('greetingGen.free')} value={free} onValueChange={setFree} />
        {thinkingCell}
      </GenSection>
      {free ? null : (
        <GenSection header={t('greetingGen.wishesLabel')} footer={t('greetingGen.wishesHint')}>
          <GenArea value={wishes} onChangeText={setWishes} placeholder={t('roomGen.openingPlaceholder')} />
          <PresetChips items={OPENING_PRESETS.map((key) => ({ key, label: t(key) }))} onPick={addPreset} />
        </GenSection>
      )}
    </>
  )

  return (
    <GenSheet
      title={t('roomGen.openingTitle')}
      resultLabel={t('roomEditor.opening')}
      current={currentOpening}
      compose={compose}
      canGenerate={free || wishes.trim().length > 0}
      generateLabel={t('promptGen.generate')}
      build={(revision) => buildOpeningMessages({ scenario, cast, wishes: free ? '' : wishes, locale }, revision)}
      tweaks={OPENING_TWEAKS}
      onApply={onApply}
    />
  )
}
