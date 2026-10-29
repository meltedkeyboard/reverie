import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'

import { GreetingGen } from '@/components/overlays/GreetingGen'
import { PersonaGen } from '@/components/overlays/PersonaGen'
import { PromptGen } from '@/components/overlays/PromptGen'
import { OpeningGen, RoomSetupGen, ScenarioGen } from '@/components/overlays/RoomGen'
import { clearGenSession } from '@/db/genSessions'
import { useDatabase } from '@/db/provider'
import { GenSessionContext } from '@/hooks/features/useGenSession'
import { genDraft } from '@/lib/chat/genDraft'

// The generator of a text of the character, persona or room editor, as a form sheet of the
// stack (see the root layout): system prompt, greeting, user persona, a room's scene, its
// opening or the whole room, by the draft left.
export default function GenerateScreen() {
  const router = useRouter()
  const db = useDatabase()
  // Read once: the draft may be replaced under a sheet still closing.
  const [draft] = useState(genDraft)
  // Starting over forgets the session and builds the generator anew, every field back to
  // how a first opening has it.
  const [round, setRound] = useState(0)
  const session = useMemo(() => {
    const key = draft ? `${draft.kind}:${draft.target}` : ''
    return {
      key,
      startOver: () => {
        clearGenSession(db, key)
        setRound((n) => n + 1)
      },
    }
  }, [db, draft])

  useEffect(() => {
    if (!draft) router.back()
  }, [draft, router])

  if (!draft) return null
  return (
    <GenSessionContext.Provider value={session}>
      {draft.kind === 'prompt' ? (
        <PromptGen key={round} name={draft.name} characterId={draft.characterId} currentPrompt={draft.currentPrompt} onApply={draft.onApply} />
      ) : draft.kind === 'greeting' ? (
        <GreetingGen key={round} name={draft.name} characterId={draft.characterId} systemPrompt={draft.systemPrompt} currentGreeting={draft.currentGreeting} onApply={draft.onApply} />
      ) : draft.kind === 'persona' ? (
        <PersonaGen key={round} name={draft.name} currentDescription={draft.currentDescription} onApply={draft.onApply} />
      ) : draft.kind === 'scenario' ? (
        <ScenarioGen key={round} cast={draft.cast} currentScenario={draft.currentScenario} onApply={draft.onApply} />
      ) : draft.kind === 'opening' ? (
        <OpeningGen key={round} cast={draft.cast} scenario={draft.scenario} currentOpening={draft.currentOpening} onApply={draft.onApply} />
      ) : (
        <RoomSetupGen key={round} cast={draft.cast} library={draft.library} currentSetup={draft.currentSetup} onApply={draft.onApply} />
      )}
    </GenSessionContext.Provider>
  )
}
