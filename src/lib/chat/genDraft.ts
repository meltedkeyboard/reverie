// What the generator sheet (app/generate.tsx) writes and where the result goes. It is passed
// around the router because the result is a callback, which doesn't fit in a route param.
export type GenDraft =
  | { kind: 'prompt'; name: string; currentPrompt: string; onApply: (prompt: string) => void }
  | { kind: 'greeting'; name: string; systemPrompt: string; currentGreeting: string; onApply: (greeting: string) => void }

let pending: GenDraft | null = null

export function setGenDraft(draft: GenDraft) {
  pending = draft
}

export function genDraft() {
  return pending
}
