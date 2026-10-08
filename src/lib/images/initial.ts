// The picture of a character without an avatar: the initial on a tint picked by the name.
// Shared by the Avatar on screen and the card picture of an export, so both look the same.
const TINTS = ['#3B2F5C', '#2F4A5C', '#5C3B47', '#365C48', '#5C4F2F', '#40406B']

export const avatarTint = (name: string) => TINTS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TINTS.length]

export const avatarInitial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
