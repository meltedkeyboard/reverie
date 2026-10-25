// What the generator sheet (app/generate.tsx) writes and where the result goes. It is passed
// around the router because the result is a callback, which doesn't fit in a route param.
// `target` names what the text belongs to (a character or a persona, by id, or "new"), so the
// sheet's session is kept for that text (src/db/genSessions.ts).
export type GenDraft = { target: string } & (
  | { kind: 'prompt'; name: string; currentPrompt: string; onApply: (prompt: string) => void }
  | { kind: 'greeting'; name: string; systemPrompt: string; currentGreeting: string; onApply: (greeting: string) => void }
  | { kind: 'persona'; name: string; currentDescription: string; onApply: (description: string) => void }
)

let pending: GenDraft | null = null

export function setGenDraft(draft: GenDraft) {
  pending = draft
}

export function genDraft() {
  return pending
}
