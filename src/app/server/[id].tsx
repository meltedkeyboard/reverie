import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { resetSkippedModelMismatch } from '@/api/llm'
import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, ChipChoiceCell, InputCell, ListFooter, ListSection, SliderCell } from '@/components/lists/GroupedList'
import { nativeForm, NativeActionRow, NativeForm, NativeHostedRow, NativeSection, NativeSliderRow, NativeTextRow } from '@/components/lists/NativeForm'
import { SFIcon } from '@/components/visuals/SFIcon'
import { Icon } from '@/components/visuals/Icon'
import { useDatabase } from '@/db/provider'
import { addServer, deleteServer, serverHost, serverName, setActiveServer, updateServer, type ServerProfile } from '@/db/prefs/settings'
import { useServerModels } from '@/hooks/features/useServerModels'
import { useServers } from '@/hooks/features/useServers'
import { useTranslation } from '@/i18n'
import { CONTEXT_STEP_TOKENS, MAX_CONTEXT_TOKENS, MIN_CONTEXT_TOKENS, formatContextTokens, formatTokensLabel } from '@/lib/core/context'
import { isDesktop } from '@/lib/core/platform'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

const fieldsOf = ({ id: _id, ...fields }: ServerProfile) => fields

// One server: its address, key and model, the models loaded on it and its context window.
// What is typed is kept as it is typed. A new one is written once it has an address, so
// leaving it empty leaves nothing behind.
export default function ServerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { activeId } = useServers()
  const server = useServerModels(isNew ? undefined : id)
  const { cfg, loaded, update, status, models } = server

  // Where the server is written: its id, once a new one has been added.
  const savedId = useRef<string | null>(isNew ? null : id)
  const adding = useRef<Promise<void> | null>(null)
  useEffect(() => {
    if (!loaded) return
    resetSkippedModelMismatch()
    const fields = fieldsOf(cfg)
    if (savedId.current) {
      updateServer(db, savedId.current, fields)
    } else if (adding.current) {
      // Typed while the new server was being added: written after it.
      adding.current.then(() => {
        if (savedId.current) updateServer(db, savedId.current, fields)
      })
    } else if (cfg.baseUrl.trim()) {
      adding.current = addServer(db, fields).then((added) => {
        savedId.current = added.id
      })
    }
  }, [db, cfg, loaded])

  const current = savedId.current !== null && savedId.current === activeId
  const title = serverName(cfg) || t(isNew ? 'servers.new' : 'servers.untitled')

  const onMakeCurrent = () => {
    if (!savedId.current) return
    Haptics.selectionAsync()
    setActiveServer(db, savedId.current)
  }

  const onDelete = () => {
    const target = savedId.current
    if (!target) return
    confirmDeletion({
      title: t('servers.delete'),
      message: t('servers.deleteConfirm', { name: serverName(cfg) || t('servers.untitled') }),
      onConfirm: async () => {
        await deleteServer(db, target)
        router.back()
      },
    })
  }

  const statusLines = status.kind === 'ok' || status.kind === 'error' ? [{ text: status.text, danger: status.kind === 'error' }] : []
  const loadLabel = server.isSelectedModelLoaded ? t('settings.reloadModel') : t('settings.loadModel')
  const canLoad = Boolean(cfg.baseUrl.trim() && cfg.model.trim())

  const renderNative = ({ ui, modifiers }: NonNullable<typeof nativeForm>) => {
    const { Text: SwiftText, HStack, Spacer, Button: SwiftButton, Image, ProgressView, SwipeActions } = ui
    const { disabled, tint, foregroundStyle, lineLimit } = modifiers
    return (
      <NativeForm>
        <NativeSection footer={[{ text: t('settings.baseUrlHint') }, ...statusLines]}>
          <NativeTextRow
            label={t('servers.nameLabel')}
            value={cfg.name}
            onChangeText={(name) => update({ name })}
            placeholder={serverHost(cfg.baseUrl) || t('servers.namePlaceholder')}
          />
          <NativeTextRow
            label={t('settings.baseUrlLabel')}
            value={cfg.baseUrl}
            onChangeText={(baseUrl) => update({ baseUrl })}
            placeholder={t('settings.baseUrlPlaceholder')}
            keyboard="url"
            plain
          />
          <NativeTextRow
            label={t('settings.apiKeyLabel')}
            value={cfg.apiKey}
            onChangeText={(apiKey) => update({ apiKey })}
            placeholder={t('settings.apiKeyPlaceholder')}
            secure
          />
          {/* Typed by hand until the server has listed its models, then picked from them. */}
          {models.length > 0 ? (
            <NativeHostedRow>
              <ChipChoiceCell label={t('settings.modelLabel')} options={models} value={cfg.model} onChange={server.onSelectModel} />
            </NativeHostedRow>
          ) : (
            <NativeTextRow
              label={t('settings.modelLabel')}
              value={cfg.model}
              onChangeText={(model) => update({ model })}
              placeholder={t('settings.modelPlaceholder')}
              plain
            />
          )}
          <NativeActionRow
            label={t('settings.testConnection')}
            symbol="bolt.horizontal"
            effect={{ effect: 'variableColor', fillStyle: 'iterative' }}
            busy={status.kind === 'testing'}
            disabled={!cfg.baseUrl.trim()}
            onPress={server.onTest}
          />
          <NativeActionRow
            label={loadLabel}
            symbol={server.isSelectedModelLoaded ? 'arrow.clockwise' : 'cpu'}
            effect={server.isSelectedModelLoaded ? { effect: 'rotate' } : { effect: 'pulse' }}
            busy={server.loadingModel}
            disabled={!canLoad}
            onPress={server.onLoadModel}
          />
        </NativeSection>

        {server.loadedModels.length > 0 ? (
          <NativeSection title={t('settings.loadedModelsHeader')} footer={t('settings.loadedModelsHint')}>
            {server.loadedModels.map((entry, index) => {
              const isCurrent = index === server.activeLoadedModelIndex
              const isUnloading = server.unloadingModelIds.has(entry.id)
              return (
                <SwipeActions key={entry.id}>
                  <HStack spacing={8} modifiers={[disabled(isUnloading)]}>
                    <SwiftButton
                      label={entry.key || entry.id}
                      onPress={() => server.onSelectActiveModel(entry, index)}
                      modifiers={[tint(colors.text), lineLimit(1)]}
                    />
                    <Spacer />
                    {entry.contextLength ? (
                      <SwiftText modifiers={[foregroundStyle(colors.textMuted)]}>{formatContextTokens(entry.contextLength)}</SwiftText>
                    ) : null}
                    {isUnloading ? <ProgressView /> : isCurrent ? <Image systemName="checkmark" size={17} color={colors.accent} /> : null}
                  </HStack>
                  <SwipeActions.Actions edge="trailing">
                    <SwiftButton label={t('settings.unload')} systemImage="eject" role="destructive" onPress={() => server.onUnloadSingle(entry)} />
                  </SwipeActions.Actions>
                </SwipeActions>
              )
            })}
            <NativeActionRow label={t('settings.unloadAllModels')} symbol="xmark.circle" destructive busy={server.unloadingAll} onPress={server.onUnloadAll} />
          </NativeSection>
        ) : null}

        <NativeSection title={t('settings.contextLabel')} footer={t('settings.contextHint')}>
          <NativeSliderRow
            label={t('settings.contextTokensLabel')}
            value={cfg.contextTokens}
            min={MIN_CONTEXT_TOKENS}
            max={MAX_CONTEXT_TOKENS}
            step={CONTEXT_STEP_TOKENS}
            format={(tokens) => formatTokensLabel(tokens)}
            onChange={(tokens) => update({ contextTokens: tokens })}
            tintColor={server.isLoaded ? colors.accent : '#8E8E93'}
          />
        </NativeSection>

        {savedId.current ? (
          <NativeSection>
            {!current ? <NativeActionRow label={t('servers.makeCurrent')} symbol="checkmark.circle" onPress={onMakeCurrent} /> : null}
            <NativeActionRow label={t('servers.delete')} symbol="trash" destructive onPress={onDelete} />
          </NativeSection>
        ) : null}
      </NativeForm>
    )
  }

  return (
    <View style={styles.screen}>
      {loaded && nativeForm ? (
        renderNative(nativeForm)
      ) : loaded ? (
        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={padding}
        >
          <ListSection
            footer={
              <>
                <ListFooter>{t('settings.baseUrlHint')}</ListFooter>
                {statusLines.map((line, i) => (
                  <ListFooter key={i} danger={line.danger}>
                    {line.text}
                  </ListFooter>
                ))}
              </>
            }
          >
            <InputCell
              label={t('servers.nameLabel')}
              value={cfg.name}
              onChangeText={(name) => update({ name })}
              placeholder={serverHost(cfg.baseUrl) || t('servers.namePlaceholder')}
            />
            <InputCell
              label={t('settings.baseUrlLabel')}
              value={cfg.baseUrl}
              onChangeText={(baseUrl) => update({ baseUrl })}
              placeholder={t('settings.baseUrlPlaceholder')}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <InputCell
              label={t('settings.apiKeyLabel')}
              value={cfg.apiKey}
              onChangeText={(apiKey) => update({ apiKey })}
              placeholder={t('settings.apiKeyPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/* Typed by hand until the server has listed its models, then picked from them. */}
            {models.length > 0 ? (
              <ChipChoiceCell label={t('settings.modelLabel')} options={models} value={cfg.model} onChange={server.onSelectModel} />
            ) : (
              <InputCell
                label={t('settings.modelLabel')}
                value={cfg.model}
                onChangeText={(model) => update({ model })}
                placeholder={t('settings.modelPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            <ButtonCell
              label={t('settings.testConnection')}
              icon={{ symbol: 'bolt.horizontal', fallback: 'pulse-outline' }}
              onPress={server.onTest}
              loading={status.kind === 'testing'}
              disabled={!cfg.baseUrl.trim()}
            />
            <ButtonCell
              label={loadLabel}
              icon={
                server.isSelectedModelLoaded
                  ? { symbol: 'arrow.clockwise', fallback: 'refresh-outline' }
                  : { symbol: 'cpu', fallback: 'hardware-chip-outline' }
              }
              onPress={server.onLoadModel}
              loading={server.loadingModel}
              disabled={!canLoad}
            />
          </ListSection>

          {server.loadedModels.length > 0 ? (
            <ListSection header={t('settings.loadedModelsHeader')} footer={t('settings.loadedModelsHint')}>
              {server.loadedModels.map((entry, index) => {
                const isCurrent = index === server.activeLoadedModelIndex
                const isUnloading = server.unloadingModelIds.has(entry.id)
                return (
                  <SwipeToUnloadModelRow
                    key={entry.id}
                    enabled={!isUnloading}
                    onUnload={() => server.onUnloadSingle(entry)}
                    onPress={() => server.onSelectActiveModel(entry, index)}
                    name={entry.key || entry.id}
                    actionLabel={t('settings.unload')}
                  >
                    <Pressable
                      onPress={() => server.onSelectActiveModel(entry, index)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isCurrent }}
                      style={({ pressed }) => [styles.loadedModelRow, pressed && styles.pressedRow, isUnloading && styles.disabled]}
                    >
                      <View style={styles.checkWrap}>
                        {isCurrent ? <SFIcon name="checkmark" fallback="checkmark" size={20} color={colors.accent} /> : null}
                      </View>
                      <View style={styles.loadedModelMain}>
                        <Text style={[styles.loadedModelName, isCurrent && { fontWeight: '600' }]} numberOfLines={1}>
                          {entry.key || entry.id}
                        </Text>
                      </View>
                      {entry.contextLength ? <Text style={styles.loadedModelTokens}>{formatContextTokens(entry.contextLength)}</Text> : null}
                      {isUnloading ? (
                        <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 6 }} />
                      ) : isDesktop ? (
                        <Pressable
                          onPress={(e) => {
                            e?.stopPropagation?.()
                            server.onUnloadSingle(entry)
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('settings.unload')}
                          hitSlop={8}
                          style={({ pressed }) => [styles.desktopUnloadBtn, pressed && { opacity: 0.7 }]}
                        >
                          <SFIcon name="eject" fallback="close-circle-outline" size={14} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  </SwipeToUnloadModelRow>
                )
              })}
              <ButtonCell
                label={t('settings.unloadAllModels')}
                icon={{ symbol: 'xmark.circle', fallback: 'close-circle-outline' }}
                danger
                onPress={server.onUnloadAll}
                loading={server.unloadingAll}
              />
            </ListSection>
          ) : null}

          <ListSection header={t('settings.contextLabel')} footer={t('settings.contextHint')}>
            <SliderCell
              label={t('settings.contextTokensLabel')}
              value={cfg.contextTokens}
              min={MIN_CONTEXT_TOKENS}
              max={MAX_CONTEXT_TOKENS}
              step={CONTEXT_STEP_TOKENS}
              formatValue={(tokens) => formatTokensLabel(tokens)}
              onChange={(tokens) => update({ contextTokens: tokens })}
              tintColor={server.isLoaded ? colors.accent : '#8E8E93'}
            />
          </ListSection>

          {savedId.current ? (
            <ListSection>
              {!current ? <ButtonCell label={t('servers.makeCurrent')} icon={{ symbol: 'checkmark.circle', fallback: 'checkmark-circle-outline' }} onPress={onMakeCurrent} /> : null}
              <ButtonCell danger label={t('servers.delete')} onPress={onDelete} />
            </ListSection>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}
      <FormScreenHeader title={title} />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    loadedModelRow: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    disabled: { opacity: 0.5 },
    pressedRow: {
      backgroundColor: colors.surfaceRaised,
    },
    checkWrap: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadedModelMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginRight: 6,
    },
    loadedModelName: {
      color: colors.text,
      fontSize: 16,
      flexShrink: 1,
    },
    loadedModelTokens: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: '500',
    },
    desktopUnloadBtn: {
      padding: 6,
      borderRadius: 6,
      marginLeft: 4,
    },
    unloadBehind: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      overflow: 'hidden',
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    unloadBehindLabel: {
      position: 'absolute',
      right: 18,
      width: 120,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
    },
    unloadBehindText: {
      color: ON_ACCENT,
      fontSize: 15,
      fontWeight: '600',
    },
  })

const UNLOAD_TRIGGER = 88
const UNLOAD_SPRING = { damping: 24, stiffness: 240 }

type SwipeToUnloadProps = {
  enabled: boolean
  onUnload: () => void
  onPress: () => void
  name: string
  actionLabel: string
  children: React.ReactNode
}

function SwipeToUnloadModelRow({ enabled, onUnload, onPress, name, actionLabel, children }: SwipeToUnloadProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const offset = useSharedValue(0)
  const armed = useSharedValue(false)

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      offset.value = e.translationX > 0 ? e.translationX * 0.15 : e.translationX
      const past = -offset.value > UNLOAD_TRIGGER
      if (past !== armed.value) {
        armed.value = past
        scheduleOnRN(tick)
      }
    })
    .onEnd(() => {
      const fire = armed.value
      armed.value = false
      offset.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished && fire) scheduleOnRN(onUnload)
      })
    })

  const peek = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    offset.value = withSequence(withTiming(-40, { duration: 150 }), withSpring(0, UNLOAD_SPRING))
  }

  const content = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))
  const behind = useAnimatedStyle(() => ({
    width: Math.max(0, -offset.value),
    opacity: interpolate(-offset.value, [0, 28], [0, 1], 'clamp'),
  }))
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(armed.value ? 1.2 : 1, { duration: 120 }) }] }))

  return (
    <View>
      <Animated.View style={[styles.unloadBehind, { backgroundColor: colors.danger }, behind]}>
        <Animated.View style={[styles.unloadBehindLabel, icon]}>
          <Icon name="close-circle-outline" size={20} color={ON_ACCENT} />
          <Text style={styles.unloadBehindText}>{actionLabel}</Text>
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={content}>
          <Pressable
            onPress={enabled ? onPress : peek}
            accessibilityLabel={name}
            accessibilityActions={enabled ? [{ name: 'unload', label: actionLabel }] : undefined}
            onAccessibilityAction={() => onUnload()}
          >
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
