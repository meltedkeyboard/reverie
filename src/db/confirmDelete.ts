import { defineFlag } from '@/db/settings'
import { setConfirmDeleteOn } from '@/lib/confirmDelete'

// Ask before deleting a chat or a character. On unless turned off in Settings.
const confirmDelete = defineFlag('confirm_delete', true, setConfirmDeleteOn)

export const isConfirmDeleteEnabled = confirmDelete.load
export const setConfirmDeleteEnabled = confirmDelete.save
