import { t } from '@/i18n'
import { imageDataUrl } from '@/lib/images'

// expo-file-system has no web implementation, so in the browser the avatars are
// kept in localStorage as data URLs. The database still stores only the name.
const PREFIX = 'reverie.avatar.'

export function avatarUri(name: string): string | null {
  try {
    return localStorage.getItem(PREFIX + name)
  } catch {
    return null
  }
}

function store(name: string, dataUrl: string) {
  try {
    localStorage.setItem(PREFIX + name, dataUrl)
  } catch {
    // localStorage is capped at a few megabytes and gives no way to ask for more.
    throw new Error(t('avatarStore.noSpace'))
  }
}

export async function persistAvatar(tempUri: string) {
  const name = `${Date.now()}.jpg`
  store(name, await readAsDataUrl(tempUri))
  return name
}

export function removeAvatar(name: string) {
  try {
    localStorage.removeItem(PREFIX + name)
  } catch {
    // Nothing to do: the avatar simply stays until the site data is cleared.
  }
}

export async function readAvatarBase64(name: string) {
  const dataUrl = avatarUri(name)
  return dataUrl ? dataUrl.slice(dataUrl.indexOf(',') + 1) : null
}

export async function writeAvatarBase64(name: string, base64: string) {
  store(name, imageDataUrl(base64))
}

export function removeAllAvatars() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to do: the avatars simply stay until the site data is cleared.
  }
}

async function readAsDataUrl(uri: string) {
  const blob = await (await fetch(uri)).blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(t('images.readFailed')))
    reader.readAsDataURL(blob)
  })
}
