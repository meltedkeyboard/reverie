import { defineFlag } from '@/db/prefs/settings'

// The eye button in the header of a chat or a scene that opens a private question to the
// model about it. On unless turned off in Settings.
const privateChat = defineFlag('private_chat_button', true)

export const isPrivateChatEnabled = privateChat.load
export const setPrivateChatEnabled = privateChat.save
