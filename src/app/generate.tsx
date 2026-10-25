import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'

import { GreetingGen } from '@/components/overlays/GreetingGen'
import { PersonaGen } from '@/components/overlays/PersonaGen'
import { PromptGen } from '@/components/overlays/PromptGen'
import { clearGenSession } from '@/db/genSessions'
import { useDatabase } from '@/db/provider'
import { GenSessionContext } from '@/hooks/features/useGenSession'
import { genDraft } from '@/lib/chat/genDraft'

// The generator of a text of the character or persona editor, as a form sheet of the stack
// (see the root layout): system prompt, greeting, or user persona, by the draft left.
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
        <PromptGen key={round} name={draft.name} currentPrompt={draft.currentPrompt} onApply={draft.onApply} />
      ) : draft.kind === 'greeting' ? (
        <GreetingGen key={round} name={draft.name} systemPrompt={draft.systemPrompt} currentGreeting={draft.currentGreeting} onApply={draft.onApply} />
      ) : (
        <PersonaGen key={round} name={draft.name} currentDescription={draft.currentDescription} onApply={draft.onApply} />
      )}
    </GenSessionContext.Provider>
  )
}
