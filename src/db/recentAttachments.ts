import { defineFlag } from '@/db/prefs/settings'

// The row of the latest pictures sent, at the top of the attach menu. On unless turned off
// in Settings, capped at a fixed recent slice so the menu stays fast.
const ENABLED_KEY = 'recent_attachments'

export const RECENT_ATTACHMENTS_LIMIT = 20

const recentAttachments = defineFlag(ENABLED_KEY, true)

export const isRecentAttachmentsEnabled = recentAttachments.load
export const setRecentAttachmentsEnabled = recentAttachments.save

// The Gallery row of the attach menu, the pictures of the chat's character or a scene's cast.
const attachGallery = defineFlag('attach_gallery', true)

export const isAttachGalleryEnabled = attachGallery.load
export const setAttachGalleryEnabled = attachGallery.save
