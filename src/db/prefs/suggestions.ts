import { defineFlag } from '@/db/prefs/settings'

// The model's guess at the user's next message, shown as the field's placeholder after
// each reply. Off unless turned on in Settings.
const suggestions = defineFlag('reply_suggestions', false)

export const isSuggestionsEnabled = suggestions.load
export const setSuggestionsEnabled = suggestions.save
