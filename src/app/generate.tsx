import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'

import { GreetingGen } from '@/components/overlays/GreetingGen'
import { PersonaGen } from '@/components/overlays/PersonaGen'
import { PromptGen } from '@/components/overlays/PromptGen'
import { genDraft } from '@/lib/chat/genDraft'

// The generator of a text of the character or persona editor, as a form sheet of the stack
// (see the root layout): system prompt, greeting, or user persona, by the draft left.
export default function GenerateScreen() {
  const router = useRouter()
  // Read once: the draft may be replaced under a sheet still closing.
  const [draft] = useState(genDraft)

  useEffect(() => {
    if (!draft) router.back()
  }, [draft, router])

  if (!draft) return null
  if (draft.kind === 'prompt') {
    return <PromptGen name={draft.name} currentPrompt={draft.currentPrompt} onApply={draft.onApply} />
  }
  if (draft.kind === 'greeting') {
    return <GreetingGen name={draft.name} systemPrompt={draft.systemPrompt} currentGreeting={draft.currentGreeting} onApply={draft.onApply} />
  }
  return <PersonaGen name={draft.name} currentDescription={draft.currentDescription} onApply={draft.onApply} />
}
