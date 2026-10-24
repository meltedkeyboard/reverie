import { defineNumber } from '@/db/prefs/settings'

// The limits of the generator sheet (system prompt, greeting, persona), kept from one
// opening to the next. A prompt runs long, so the text gets more than a chat reply.
export const GEN_TOKENS = { min: 512, max: 8192, step: 128, default: 4096 } as const
export const GEN_REASONING = { min: 256, max: 16384, step: 128, default: 2048 } as const

const genTokens = defineNumber('gen_max_tokens', GEN_TOKENS.min, GEN_TOKENS.max, GEN_TOKENS.default)
const genReasoning = defineNumber('gen_reasoning_budget', GEN_REASONING.min, GEN_REASONING.max, GEN_REASONING.default)

export const loadGenTokens = genTokens.load
export const saveGenTokens = genTokens.save
export const loadGenReasoning = genReasoning.load
export const saveGenReasoning = genReasoning.save
