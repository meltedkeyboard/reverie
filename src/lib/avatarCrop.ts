// The picture file the avatar crop screen frames, and where the square goes. Passed
// around the router like the background draft: a callback does not fit in a route param.
export type AvatarCropDraft = {
  uri: string
  onDone: (uri: string) => void
}

let pending: AvatarCropDraft | null = null

export function setAvatarCropDraft(draft: AvatarCropDraft) {
  pending = draft
}

export function avatarCropDraft() {
  return pending
}
