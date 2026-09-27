// What the full-screen text editor edits, and where each change goes. It is passed around
// the router because the result is a callback, which doesn't fit in a route param.
export type TextDraft = {
  title: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

let pending: TextDraft | null = null

export function setTextDraft(draft: TextDraft) {
  pending = draft
}

export function textDraft() {
  return pending
}
