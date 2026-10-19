import { defineFlag, defineNumber } from '@/db/prefs/settings'

// The model's guess at the user's next message, shown as the field's placeholder after
// each reply. Off unless turned on in Settings.
const suggestions = defineFlag('reply_suggestions', false)

export const isSuggestionsEnabled = suggestions.load
export const setSuggestionsEnabled = suggestions.save

// A guess is one to three sentences, and thinking is off for it, so this is all it writes.
export const SUGGESTION_TOKENS = { min: 50, max: 1000, step: 10, default: 200 } as const
const suggestionTokens = defineNumber('reply_suggestion_tokens', SUGGESTION_TOKENS.min, SUGGESTION_TOKENS.max, SUGGESTION_TOKENS.default)

export const loadSuggestionTokens = suggestionTokens.load
export const saveSuggestionTokens = suggestionTokens.save
