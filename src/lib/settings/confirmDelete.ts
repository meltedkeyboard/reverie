import { t } from '@/i18n'
import { confirm } from '@/lib/ui/dialogs'

// Whether deleting a chat or a character asks first. Kept in memory so every call site can
// check it synchronously; the db layer loads it at startup and Settings writes it.
let enabled = true

export const isConfirmDeleteOn = () => enabled
export const setConfirmDeleteOn = (on: boolean) => {
  enabled = on
}

type ConfirmOptions = Parameters<typeof confirm>[0]

// A delete that asks, unless the question is turned off in Settings. The button reads
// "Delete" and is drawn as destructive unless the caller says otherwise.
export function confirmDeletion(options: Omit<ConfirmOptions, 'confirmLabel' | 'destructive'> & Partial<ConfirmOptions>) {
  if (enabled) confirm({ confirmLabel: t('common.delete'), destructive: true, ...options })
  else options.onConfirm()
}
