import { defineChoice, defineFlag, defineNumber } from '@/db/prefs/settings'

// The model's guess at the user's next message, shown as the field's placeholder after
// each reply. Off unless turned on in Settings.
const suggestions = defineFlag('reply_suggestions', false)

export const isSuggestionsEnabled = suggestions.load
export const setSuggestionsEnabled = suggestions.save

// A guess is one to three sentences, and thinking is off for it, so this is all it writes.
export const SUGGESTION_TOKENS = { min: 100, max: 16384, step: 10, default: 1024 } as const
const suggestionTokens = defineNumber('reply_suggestion_tokens', SUGGESTION_TOKENS.min, SUGGESTION_TOKENS.max, SUGGESTION_TOKENS.default)

export const loadSuggestionTokens = suggestionTokens.load
export const saveSuggestionTokens = suggestionTokens.save

export type SuggestionContextMode = 'limit' | 'all'

export const SUGGESTION_MESSAGES = { min: 1, max: 200, default: 6 } as const
const suggestionContextMode = defineChoice<SuggestionContextMode>('reply_suggestion_context_mode', ['limit', 'all'], 'limit')
export const loadSuggestionContextMode = suggestionContextMode.load
export const saveSuggestionContextMode = suggestionContextMode.save

const suggestionMessages = defineNumber('reply_suggestion_messages', SUGGESTION_MESSAGES.min, SUGGESTION_MESSAGES.max, SUGGESTION_MESSAGES.default)
export const loadSuggestionMessages = suggestionMessages.load
export const saveSuggestionMessages = suggestionMessages.save
