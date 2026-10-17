import type { Persona } from '@/db/personas'

/**
 * Formats a Persona into a system prompt instruction.
 * If persona is null or empty, returns an empty string so the system prompt remains untouched.
 */
export function formatPersonaPrompt(persona: Persona | null): string {
  if (!persona) return ''
  const name = persona.name.trim()
  const desc = persona.description.trim()
  if (!name && !desc) return ''

  const lines: string[] = []
  if (name) lines.push(`User's name: ${name}`)
  if (desc) lines.push(desc)

  return `[User Persona]\n${lines.join('\n')}\nTreat and address the user in accordance with this persona.`
}
