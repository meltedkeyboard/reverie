import { useEffect, useState } from 'react'

import { InputCell, ListFooter, ListSection, SliderCell, SwitchCell } from '@/components/lists/GroupedList'
import { NativeSection, NativeSliderRow, NativeTextRow } from '@/components/lists/NativeForm'
import { SettingsSubpage } from '@/components/lists/SettingsSubpage'
import { DEFAULT_SETTINGS, loadSettings, saveContextLimits, typedCount, updateServer, type ContextLimits } from '@/db/prefs/settings'
import { useDatabase } from '@/db/provider'
import { useServers } from '@/hooks/features/useServers'
import { useTranslation } from '@/i18n'
import { CONTEXT_STEP_TOKENS, MAX_CONTEXT_TOKENS, MIN_CONTEXT_TOKENS, formatTokensLabel } from '@/lib/core/context'

export default function ContextSettingsScreen() {
  const db = useDatabase()
  const { t } = useTranslation()
  const [context, setContext] = useState<ContextLimits | null>(null)
  const [messageDrafts, setMessageDrafts] = useState<{ chatMessages?: string; roomMessages?: string }>({})
  const { servers, activeId } = useServers()
  const activeServer = servers?.find((s) => s.id === activeId)
  const [contextDraft, setContextDraft] = useState<number | null>(null)

  useEffect(() => {
    loadSettings(db).then(({ limitMessages, chatMessages, roomMessages }) => setContext({ limitMessages, chatMessages, roomMessages }))
  }, [db])

  useEffect(() => setContextDraft(null), [activeId])

  const cfg: ContextLimits = context ?? DEFAULT_SETTINGS
  const update = (patch: Partial<ContextLimits>) => {
    const next = { limitMessages: cfg.limitMessages, chatMessages: cfg.chatMessages, roomMessages: cfg.roomMessages, ...patch }
    setContext(next)
    saveContextLimits(db, next)
  }

  const contextTokens = contextDraft ?? activeServer?.contextTokens ?? DEFAULT_SETTINGS.contextTokens
  const setContextTokens = (tokens: number) => {
    if (!activeServer) return
    setContextDraft(tokens)
    updateServer(db, activeServer.id, { contextTokens: tokens })
  }

  const setMessages = (field: 'chatMessages' | 'roomMessages', text: string) => {
    const { digits, count } = typedCount(text)
    setMessageDrafts((d) => ({ ...d, [field]: digits }))
    if (count) update({ [field]: count })
  }

  const loaded = context !== null

  return (
    <SettingsSubpage
      title={t('settings.contextLabel')}
      keyboard
      native={({ ui }) => {
        if (!loaded) return null
        const { Toggle } = ui
        return (
          <NativeSection
            footer={[
              { text: t('settings.contextHint') },
              ...(cfg.limitMessages ? [{ text: t('settings.contextMessagesHint') }] : []),
              ...(cfg.limitMessages && (cfg.chatMessages > 1000 || cfg.roomMessages > 1000)
                ? [{ text: t('settings.contextMessagesWarning'), danger: true }]
                : []),
            ]}
          >
            {activeServer ? (
              <NativeSliderRow
                label={t('settings.contextTokensLabel')}
                value={contextTokens}
                min={MIN_CONTEXT_TOKENS}
                max={MAX_CONTEXT_TOKENS}
                step={CONTEXT_STEP_TOKENS}
                format={(tokens) => formatTokensLabel(tokens)}
                onChange={setContextTokens}
              />
            ) : null}
            <Toggle label={t('settings.contextMessages')} isOn={cfg.limitMessages} onIsOnChange={(limitMessages) => update({ limitMessages })} />
            <NativeTextRow
              label={t('settings.contextChatMessages')}
              value={messageDrafts.chatMessages ?? String(cfg.chatMessages)}
              onChangeText={(text) => setMessages('chatMessages', text)}
              keyboard="number-pad"
              disabled={!cfg.limitMessages}
            />
            <NativeTextRow
              label={t('settings.contextRoomMessages')}
              value={messageDrafts.roomMessages ?? String(cfg.roomMessages)}
              onChangeText={(text) => setMessages('roomMessages', text)}
              keyboard="number-pad"
              disabled={!cfg.limitMessages}
            />
          </NativeSection>
        )
      }}
      fallback={
        loaded ? (
          <ListSection
            footer={
              <>
                <ListFooter>{t('settings.contextHint')}</ListFooter>
                {cfg.limitMessages ? (
                  <>
                    <ListFooter>{t('settings.contextMessagesHint')}</ListFooter>
                    {cfg.chatMessages > 1000 || cfg.roomMessages > 1000 ? (
                      <ListFooter danger>{t('settings.contextMessagesWarning')}</ListFooter>
                    ) : null}
                  </>
                ) : null}
              </>
            }
          >
            {activeServer ? (
              <SliderCell
                label={t('settings.contextTokensLabel')}
                value={contextTokens}
                min={MIN_CONTEXT_TOKENS}
                max={MAX_CONTEXT_TOKENS}
                step={CONTEXT_STEP_TOKENS}
                formatValue={(tokens) => formatTokensLabel(tokens)}
                onChange={setContextTokens}
              />
            ) : null}
            <SwitchCell label={t('settings.contextMessages')} value={cfg.limitMessages} onValueChange={(limitMessages) => update({ limitMessages })} />
            <InputCell
              label={t('settings.contextChatMessages')}
              value={messageDrafts.chatMessages ?? String(cfg.chatMessages)}
              onChangeText={(text) => setMessages('chatMessages', text)}
              keyboardType="number-pad"
              disabled={!cfg.limitMessages}
            />
            <InputCell
              label={t('settings.contextRoomMessages')}
              value={messageDrafts.roomMessages ?? String(cfg.roomMessages)}
              onChangeText={(text) => setMessages('roomMessages', text)}
              keyboardType="number-pad"
              disabled={!cfg.limitMessages}
            />
          </ListSection>
        ) : null
      }
    />
  )
}
