import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'

import { GreetingGen } from '@/components/overlays/GreetingGen'
import { PromptGen } from '@/components/overlays/PromptGen'
import { genDraft } from '@/lib/chat/genDraft'

// The generator of a text of the character editor, as a form sheet of the stack (see the
// root layout): the system prompt or the greeting, by the draft the editor left.
export default function GenerateScreen() {
  const router = useRouter()
  // Read once: the draft may be replaced under a sheet still closing.
  const [draft] = useState(genDraft)

  useEffect(() => {
    if (!draft) router.back()
  }, [draft, router])

  if (!draft) return null
  return draft.kind === 'prompt' ? (
    <PromptGen name={draft.name} currentPrompt={draft.currentPrompt} onApply={draft.onApply} />
  ) : (
    <GreetingGen name={draft.name} systemPrompt={draft.systemPrompt} currentGreeting={draft.currentGreeting} onApply={draft.onApply} />
  )
}
