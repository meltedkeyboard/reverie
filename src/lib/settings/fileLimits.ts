// How big a moving avatar, a moving chat background and a moving picture of a message may be. Kept in memory so the
// pickers can ask synchronously; the db layer loads it at startup and Settings writes it.
export const DEFAULT_AVATAR_MB = 15
export const DEFAULT_BACKGROUND_MB = 30
export const DEFAULT_ATTACHMENT_MB = 60

type Limits = { off: boolean; avatarMb: number; backgroundMb: number; attachmentMb: number }

let limits: Limits = { off: false, avatarMb: DEFAULT_AVATAR_MB, backgroundMb: DEFAULT_BACKGROUND_MB, attachmentMb: DEFAULT_ATTACHMENT_MB }

export const getFileLimits = () => limits
export const setFileLimits = (next: Limits) => {
  limits = next
}

const MB = 1024 * 1024

// Infinity while the limits are switched off.
export const avatarLimitBytes = () => (limits.off ? Infinity : limits.avatarMb * MB)
export const backgroundLimitBytes = () => (limits.off ? Infinity : limits.backgroundMb * MB)
export const attachmentLimitBytes = () => (limits.off ? Infinity : limits.attachmentMb * MB)
