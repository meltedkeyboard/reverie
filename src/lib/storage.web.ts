// The browser has no Files app, so there is nothing to hide.
export const databaseDirectory: string | undefined = undefined

export function isShownInFiles() {
  return false
}

export function setShownInFiles(_shown: boolean) {}

export function isStoragePending() {
  return false
}
