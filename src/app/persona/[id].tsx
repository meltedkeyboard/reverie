import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Avatar } from '@/components/visuals/Avatar'
import { ButtonCell, InputCell, ListFooter, ListSection, SwitchCell, TextCell } from '@/components/lists/GroupedList'
import { NativeActionRow, NativeForm, NativeHostedRow, NativeSection, NativeTextRow, nativeForm } from '@/components/lists/NativeForm'
import { ChipRowCell, SourceCell } from '@/components/lists/PictureCells'
import { BarButton, DrawnFormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { createPersona, deletePersona, getPersona, updatePersona } from '@/db/personas'
import { useDatabase } from '@/db/provider'
import { useImageSlot } from '@/hooks/features/useImageSlot'
import { useTranslation } from '@/i18n'
import { setAvatarCropDraft } from '@/lib/images/avatarCrop'
import { setGenDraft } from '@/lib/chat/genDraft'
import { acceptMoving, pickAvatar, type CropRect } from '@/lib/images/avatars'
import type { ImageSource } from '@/lib/images/images'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { alertError } from '@/lib/transfer/report'
import { type Colors, HEADER_ROW_HEIGHT, useColors, useStyles } from '@/theme'

export default function PersonaEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()

  const [ready, setReady] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [beforeGen, setBeforeGen] = useState<string | null>(null)

  const [avatar, setAvatar] = useState<string | null>(null)
  const [avatarOriginal, setAvatarOriginal] = useState<string | null>(null)
  const [avatarCrop, setAvatarCrop] = useState<string | null>(null)
  const avatarSlot = useImageSlot('avatars')

  const [removedAvatar, setRemovedAvatar] = useState<{
    file: string | null
    original: string | null
    crop: string | null
    picked: ReturnType<typeof avatarSlot.snapshot>
  } | null>(null)

  useEffect(() => {
    if (isNew) return
    getPersona(db, Number(id)).then((found) => {
      if (!found) return router.back()
      setName(found.name)
      setDescription(found.description)
      setIsDefault(found.isDefault)
      setAvatar(found.avatar)
      setAvatarOriginal(found.avatarOriginal)
      setAvatarCrop(found.avatarCrop)
      avatarSlot.remember({ file: found.avatar, original: found.avatarOriginal })
      setReady(true)
    })
  }, [db, id, isNew, router])

  const canSave = ready && !saving && name.trim().length > 0

  const openCrop = (uri: string, crop: CropRect | null, original: string | null) => {
    setAvatarCropDraft({
      uri,
      crop,
      onDone: (framed, rect) => {
        setRemovedAvatar(null)
        avatarSlot.setFramed(framed, rect, original)
        if (original) setAvatarOriginal(null)
      },
    })
    router.push('/avatar-crop')
  }

  const onPickAvatar = async (source: ImageSource) => {
    try {
      const file = await pickAvatar(source)
      if (!file) return
      if (acceptMoving(file)) {
        setRemovedAvatar(null)
        avatarSlot.setUnframed(file)
        setAvatarOriginal(null)
        return
      }
      openCrop(file, null, file)
    } catch (err) {
      alertError(t('editor.avatarFailedTitle'), err)
    }
  }

  const onRecropAvatar = () => {
    const source = avatarSlot.adjustSource({ file: avatar, original: avatarOriginal, crop: avatarCrop })
    if (source) openCrop(source.uri, source.crop, source.original)
  }

  const onClearAvatar = () => {
    setRemovedAvatar({
      file: avatar,
      original: avatarOriginal,
      crop: avatarCrop,
      picked: avatarSlot.snapshot(),
    })
    avatarSlot.clearPicked()
    setAvatar(null)
    setAvatarOriginal(null)
    setAvatarCrop(null)
  }

  const onRestoreAvatar = () => {
    if (!removedAvatar) return
    setAvatar(removedAvatar.file)
    setAvatarOriginal(removedAvatar.original)
    setAvatarCrop(removedAvatar.crop)
    avatarSlot.restore(removedAvatar.picked)
    setRemovedAvatar(null)
  }

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const nextAvatarValue = await avatarSlot.persist({ file: avatar, original: avatarOriginal, crop: avatarCrop })
      const { file: nextAvatar, original: nextAvatarOriginal, crop: nextAvatarCrop } = nextAvatarValue

      if (isNew) {
        await createPersona(db, {
          name,
          avatar: nextAvatar,
          avatarOriginal: nextAvatarOriginal,
          avatarCrop: nextAvatarCrop,
          description,
          isDefault,
        })
      } else {
        await updatePersona(db, Number(id), {
          name,
          avatar: nextAvatar,
          avatarOriginal: nextAvatarOriginal,
          avatarCrop: nextAvatarCrop,
          description,
          isDefault,
        })
      }
      avatarSlot.settle(nextAvatarValue)
      setRemovedAvatar(null)
      router.back()
    } catch (err) {
      alertError(t('common.error'), err)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = () => {
    confirmDeletion({
      title: t('persona.delete'),
      message: t('persona.deleteConfirm', { name }),
      confirmLabel: t('persona.delete'),
      destructive: true,
      onConfirm: async () => {
        await deletePersona(db, Number(id))
        avatarSlot.removeStored()
        router.back()
      },
    })
  }

  const openPersonaGen = () => {
    setGenDraft({
      kind: 'persona',
      name,
      currentDescription: description,
      onApply: applyGenerated,
    })
    router.push('/generate')
  }

  const applyGenerated = (text: string) => {
    setBeforeGen(description)
    setDescription(text)
  }

  const undoGenerated = () => {
    if (beforeGen === null) return
    setDescription(beforeGen)
    setBeforeGen(null)
  }

  const photoUri = avatarSlot.shown(avatar)
  const hasPhoto = Boolean(photoUri)
  const canRecrop = hasPhoto
  const title = isNew ? t('persona.new') : t('persona.edit')

  // The photo with where a new one comes from and what is done with the one there is.
  const photo = (
    <View style={styles.avatarBlock}>
      <View style={styles.editorAvatar}>
        <Avatar name={name} file={avatar} uri={avatarSlot.uri} size={96} viewable={hasPhoto} />
        <View style={styles.editorAvatarActions}>
          <ListSection>
            <SourceCell label={hasPhoto ? t('editor.changePhoto') : t('editor.choosePhoto')} onPick={onPickAvatar} />
            {hasPhoto || removedAvatar ? (
              <ChipRowCell
                actions={[
                  ...(canRecrop
                    ? [{ label: t('editor.recropPhoto'), icon: { symbol: 'crop', fallback: 'crop-outline' } as const, onPress: onRecropAvatar }]
                    : []),
                  removedAvatar
                    ? {
                        label: t('editor.restorePhoto'),
                        icon: { symbol: 'arrow.uturn.backward', fallback: 'arrow-undo-outline' } as const,
                        onPress: onRestoreAvatar,
                      }
                    : {
                        label: t('editor.removePhoto'),
                        icon: { symbol: 'trash', fallback: 'trash-outline' } as const,
                        onPress: onClearAvatar,
                        ink: colors.danger,
                      },
                ]}
              />
            ) : null}
          </ListSection>
        </View>
      </View>
    </View>
  )

  // The description's preview, which opens the editor over the whole screen.
  const descriptionText = (
    <TextCell
      title={t('persona.descriptionLabel')}
      value={description}
      placeholder={t('persona.descriptionPlaceholder')}
      onChangeText={(v) => {
        setDescription(v)
        setBeforeGen(null)
      }}
      lines={6}
    />
  )

  // The same page as the system's own list (iOS with SwiftUI). The photo and the
  // description's preview stay React Native views in rows of their own: the photo as it is
  // laid out here, the preview for the zoom into the editor.
  const renderNative = ({ ui }: NonNullable<typeof nativeForm>) => (
    <NativeForm>
      <NativeSection inset={HEADER_ROW_HEIGHT}>
        <NativeHostedRow clear>{photo}</NativeHostedRow>
      </NativeSection>

      <NativeSection>
        <NativeTextRow label={t('persona.nameLabel')} value={name} onChangeText={setName} placeholder={t('persona.namePlaceholder')} />
      </NativeSection>

      <NativeSection title={t('persona.descriptionLabel')} footer={t('persona.descriptionHint')}>
        <NativeHostedRow>{descriptionText}</NativeHostedRow>
        <NativeActionRow label={description.trim() ? t('editor.improveWithAi') : t('editor.generateWithAi')} onPress={openPersonaGen} />
        {beforeGen !== null ? <NativeActionRow label={t('editor.undoGenerated')} onPress={undoGenerated} /> : null}
      </NativeSection>

      <NativeSection footer={t('persona.defaultHint')}>
        <ui.Toggle label={t('persona.defaultLabel')} isOn={isDefault} onIsOnChange={setIsDefault} />
      </NativeSection>

      {!isNew ? (
        <NativeSection>
          <NativeActionRow label={t('persona.delete')} destructive onPress={confirmDelete} />
        </NativeSection>
      ) : null}
    </NativeForm>
  )

  return (
    <View style={styles.screen}>
      {ready && nativeForm ? (
        renderNative(nativeForm)
      ) : ready ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          <View style={styles.avatarGap}>{photo}</View>

          <ListSection>
            <InputCell
              label={t('persona.nameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('persona.namePlaceholder')}
            />
          </ListSection>

          <ListSection header={t('persona.descriptionLabel')} footer={t('persona.descriptionHint')}>
            {descriptionText}
            <ButtonCell
              label={description.trim() ? t('editor.improveWithAi') : t('editor.generateWithAi')}
              onPress={openPersonaGen}
            />
            {beforeGen !== null ? <ButtonCell label={t('editor.undoGenerated')} onPress={undoGenerated} /> : null}
          </ListSection>

          <ListSection footer={<ListFooter>{t('persona.defaultHint')}</ListFooter>}>
            <SwitchCell
              label={t('persona.defaultLabel')}
              value={isDefault}
              onValueChange={setIsDefault}
            />
          </ListSection>

          {!isNew ? (
            <ListSection>
              <ButtonCell danger label={t('persona.delete')} onPress={confirmDelete} />
            </ListSection>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}

      <DrawnFormScreenHeader
        title={title}
        right={
          <View style={styles.headerButtons}>
            <BarButton
              symbol="checkmark"
              fallback="checkmark"
              disabled={!canSave}
              onPress={onSave}
              accessibilityLabel={t('common.save')}
              prominent
            />
          </View>
        }
      />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    avatarBlock: { alignItems: 'center' },
    avatarGap: { marginBottom: 24 },
    editorAvatar: { flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'stretch' },
    editorAvatarActions: { flex: 1, marginBottom: -28 },
  })
