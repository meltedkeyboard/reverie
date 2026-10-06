import { useState } from 'react'

import { closeDialog } from '@/lib/ui/dialogStore'

// The text being typed into a prompt, and the submit that closes it and hands the text over.
export function usePromptState(initial: string | undefined, onSubmit: (text: string) => void) {
  const [text, setText] = useState(initial ?? '')
  const submit = () => {
    closeDialog()
    onSubmit(text)
  }
  return { text, setText, submit }
}
