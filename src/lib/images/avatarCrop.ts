// The picture file the avatar crop screen frames, and where the square goes. Passed
// around the router like the background draft: a callback does not fit in a route param.
import type { CropRect } from '@/lib/images/avatars'

export type AvatarCropDraft = {
  // The original, uncropped.
  uri: string
  // The frame to start from when framing is redone.
  crop?: CropRect | null
  // The framed copy to show, and the frame it was cut with.
  onDone: (uri: string, crop: CropRect) => void
}

let pending: AvatarCropDraft | null = null

export function setAvatarCropDraft(draft: AvatarCropDraft) {
  pending = draft
}

export function avatarCropDraft() {
  return pending
}
