import { toByteArray } from 'base64-js'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import type { SQLiteDatabase } from 'expo-sqlite'

import { DEFAULT_SAMPLING, insertCharacter } from '@/db/characters'
import { t } from '@/i18n'
import { avatarUri, persistAvatar, persistOriginal, squareAvatar } from '@/lib/images/avatars'
import { PLACEHOLDER_PNG_BASE64 } from '@/lib/images/cardPlaceholder'
import { buildCard, embedCard, isPng, parseCard, readPngCard } from '@/lib/transfer/characterCard'
import { saveFile, saveImageBytes } from '@/lib/transfer/download'

// The avatar as PNG bytes, since a card lives in a PNG text chunk. Without an avatar (or one
// that can't be drawn, like a video) a plain picture carries the card instead.
async function cardPicture(avatar: string | null) {
  const uri = avatar && avatarUri(avatar)
  if (uri) {
    try {
      const image = await ImageManipulator.manipulate(uri).renderAsync()
      const saved = await image.saveAsync({ format: SaveFormat.PNG })
      const file = new File(saved.uri)
      try {
        return await file.bytes()
      } finally {
        file.delete()
      }
    } catch {}
  }
  return toByteArray(PLACEHOLDER_PNG_BASE64)
}

// Saves the character as a card picture: the avatar with the V2 card inside, either through
// the Files "Save as" sheet or to Photos. Null when the user cancelled.
export type CardCharacter = { name: string; avatar: string | null; systemPrompt: string; greeting: string }

export const buildCardPng = async (character: CardCharacter) => embedCard(await cardPicture(character.avatar), buildCard(character))

export const cardFileName = (name: string, extension: string) => `${name.replace(/[\\/:*?"<>|]/g, '').trim() || 'character'}.${extension}`

export async function exportCharacterCard(character: CardCharacter, target: 'files' | 'photos') {
  const png = await buildCardPng(character)
  const fileName = cardFileName(character.name, 'png')
  if (target === 'files') return saveFile(fileName, png, 'image/png')
  await saveImageBytes(png, 'png')
  return { name: fileName, folder: t('card.photos') }
}

export type CardSource = 'files' | 'photos'

// Photos holds pictures only, and quality 1 keeps the original bytes of a PNG, text chunk
// included; Files also offers a JSON card.
async function pickCardUri(source: CardSource) {
  if (source === 'photos') {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    return picked.canceled ? null : picked.assets[0].uri
  }
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'image/png'] })
  return picked.canceled ? null : picked.assets[0].uri
}

// Lets the user pick a Character Card (JSON or PNG) from Files or Photos and adds it as a
// new character; a PNG also becomes the avatar. Returns the new character's name, or null
// when nothing was picked.
export async function importCharacterCard(db: SQLiteDatabase, source: CardSource) {
  const uri = await pickCardUri(source)
  return uri ? importCardFile(db, uri, source === 'photos') : null
}

// A card that is already a file: picked, or dropped on the list from another app. Only a
// picture can come from Photos.
export async function importCardFile(db: SQLiteDatabase, uri: string, pictureOnly: boolean) {
  const file = new File(uri)

  const bytes = await file.bytes()
  const png = isPng(bytes)
  // A photo that isn't a PNG (a JPEG, a screenshot) can't carry a card at all.
  if (pictureOnly && !png) throw new Error(t('card.noCardInPng'))
  let card: unknown
  try {
    card = png ? readPngCard(bytes) : JSON.parse(await file.text())
  } catch {
    throw new Error(t('card.notACard'))
  }
  if (card === null) throw new Error(t('card.noCardInPng'))
  const fields = parseCard(card)

  // The card's picture is kept whole beside its square, so the framing can be redone.
  const avatar = png ? await persistAvatar(await squareAvatar(file.uri)) : null
  const avatarOriginal = png ? await persistOriginal(file.uri) : null
  await insertCharacter(db, {
    ...fields,
    avatar,
    avatarOriginal,
    avatarCrop: null,
    ...DEFAULT_SAMPLING,
    replyLimit: null,
    thinking: 'auto',
    background: null,
    backgroundOriginal: null,
    backgroundCrop: null,
    backgroundEffect: 'blur',
    backgroundIntensity: 0.5,
    backgroundBubbleTransparency: 0.3,
  })
  return fields.name
}
