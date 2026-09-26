import { confirm } from '@/lib/dialogs'

// Whether deleting a chat or a character asks first. Kept in memory so every call site can
// check it synchronously; the db layer loads it at startup and Settings writes it.
let enabled = true

export const isConfirmDeleteOn = () => enabled
export const setConfirmDeleteOn = (on: boolean) => {
  enabled = on
}

// A delete that asks, unless the question is turned off in Settings.
export function confirmDeletion(options: Parameters<typeof confirm>[0]) {
  if (enabled) confirm(options)
  else options.onConfirm()
}
