import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import ReorderableList from 'react-native-reorderable-list'

import { probeServer } from '@/api/llm'
import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { Button } from '@/components/controls/Button'
import { IconButton } from '@/components/controls/IconButton'
import { EmptyState, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { ListFooter, ListSection, SwitchCell } from '@/components/lists/GroupedList'
import { ListCard } from '@/components/lists/ListCard'
import { nativeForm, NativeActionRow, NativeForm, NativeSection } from '@/components/lists/NativeForm'
import { menuItemViews, type MenuItem } from '@/components/overlays/NativeMenu'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useDatabase } from '@/db/provider'
import { addServer, deleteServer, orderServers, saveFailover, serverName, setActiveServer, type ServerProfile } from '@/db/prefs/settings'
import { useServers } from '@/hooks/features/useServers'
import { useTranslation } from '@/i18n'
import { isIOS } from '@/lib/core/platform'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import * as Haptics from '@/lib/ui/haptics'
import { useColors, useStyles, type Colors } from '@/theme'

type Reach = 'up' | 'down'

// The servers are asked whether they answer this often while the list is in view.
const PROBE_EVERY = 10_000

// Where a server's answer is kept: by its address too, so an address changed on its screen
// is not shown in the old one's color.
const reachKey = (s: ServerProfile) => `${s.id} ${s.baseUrl.trim()}`

// The servers, opened from Settings, as the networks of the Wi-Fi settings: a tap uses one,
// its check moves there, and the info button opens its settings. The order is the one they
// take over in when the current one does not answer, changed by dragging in Edit.
export default function ServersScreen() {
  const db = useDatabase()
  const router = useRouter()
  const navigation = useNavigation()
  const colors = useColors()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { servers, setServers, activeId, failover, setFailover } = useServers()
  const [editing, setEditing] = useState(false)
  const [reach, setReach] = useState<Record<string, Reach>>({})

  const serversRef = useRef(servers)
  serversRef.current = servers
  useFocusEffect(
    useCallback(() => {
      let alive = true
      const probe = () => {
        for (const server of serversRef.current ?? []) {
          if (!server.baseUrl.trim()) continue
          probeServer(server).then((up) => {
            if (alive) setReach((prev) => ({ ...prev, [reachKey(server)]: up ? 'up' : 'down' }))
          })
        }
      }
      probe()
      const timer = setInterval(probe, PROBE_EVERY)
      return () => {
        alive = false
        clearInterval(timer)
      }
    }, [servers?.length]),
  )

  const list = servers ?? []
  const canEdit = list.length > 1
  const add = () => router.push('/server/new')
  const open = (server: ServerProfile) => router.push(`/server/${server.id}`)
  const nameOf = (server: ServerProfile) => serverName(server) || t('servers.untitled')

  const use = (server: ServerProfile) => {
    if (server.id === activeId) return
    Haptics.selectionAsync()
    setActiveServer(db, server.id)
  }

  const duplicate = async (server: ServerProfile) => {
    const { id: _id, ...fields } = server
    await addServer(db, { ...fields, name: `${nameOf(server)} 2` })
  }

  const confirmDelete = (server: ServerProfile) => {
    confirmDeletion({
      title: t('servers.delete'),
      message: t('servers.deleteConfirm', { name: nameOf(server) }),
      onConfirm: () => deleteServer(db, server.id),
    })
  }

  const reorder = (next: ServerProfile[]) => {
    setServers(next)
    orderServers(db, next.map((s) => s.id))
  }

  const toggleFailover = (on: boolean) => {
    setFailover(on)
    saveFailover(db, on)
  }

  const menuOf = (server: ServerProfile): MenuItem[] => [
    { label: t('servers.open'), systemImage: 'info.circle', onSelect: () => open(server) },
    ...(server.id === activeId ? [] : [{ label: t('servers.makeCurrent'), systemImage: 'checkmark.circle', onSelect: () => use(server) }]),
    { label: t('servers.duplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(server) },
    { label: t('common.delete'), systemImage: 'trash', destructive: true, separated: true, onSelect: () => confirmDelete(server) },
  ]

  // A server with no name of its own goes by its address already, so the line under it has only the model.
  // A server's name is green while it answers and red while it does not; before the first
  // answer, or with no address, it is in the text's own color.
  const toneOf = (server: ServerProfile) => {
    const state = reach[reachKey(server)]
    return state ? (state === 'up' ? colors.success : colors.danger) : undefined
  }
  const stateLabel = (server: ServerProfile) => {
    const state = reach[reachKey(server)]
    return state ? t(state === 'up' ? 'servers.up' : 'servers.down') : undefined
  }

  const subtitle = (server: ServerProfile) =>
    [server.name.trim() ? server.baseUrl.trim() : '', server.model.trim()].filter(Boolean).join(' · ')

  // The bar's buttons: Edit while there is an order to change, and the plus. Edit is left
  // when the list falls to one server, so the list is not stuck in it.
  useLayoutEffect(() => {
    if (editing && !canEdit) setEditing(false)
    const toggleEditing = () => {
      Haptics.selectionAsync()
      setEditing((on) => !on)
    }
    navigation.setOptions(
      isIOS
        ? {
            unstable_headerRightItems: () => [
              ...(canEdit
                ? [
                    {
                      type: 'button' as const,
                      label: editing ? t('common.done') : t('servers.edit'),
                      ...(editing ? { variant: 'prominent' as const, tintColor: colors.accent } : {}),
                      onPress: toggleEditing,
                    },
                  ]
                : []),
              {
                type: 'button' as const,
                label: t('servers.add'),
                icon: { type: 'sfSymbol' as const, name: 'plus' as const },
                onPress: add,
              },
            ],
          }
        : {
            headerRight: () => <IconButton name="add" size={26} onPress={add} accessibilityLabel={t('servers.add')} />,
          }
    )
  }, [navigation, editing, canEdit, colors.accent, t])

  const renderNative = ({ ui, modifiers }: NonNullable<typeof nativeForm>) => {
    const { List, HStack, VStack, Spacer, Text: SwiftText, Button: SwiftButton, Image, Toggle, SwipeActions, ContextMenu } = ui
    const { environment, tint, foregroundStyle, lineLimit, font, opacity, buttonStyle, labelStyle, accessibilityValue, moveDisabled } = modifiers
    const secondary = { type: 'hierarchical', style: 'secondary' } as const
    return (
      <NativeForm modifiers={[environment('editMode', editing ? 'active' : 'inactive')]}>
        <NativeSection title={t('servers.title')} footer={list.length ? t('servers.listHint') : t('servers.emptyText')}>
          <List.ForEach
            onMove={(sources, destination) => {
              const moved = sources.map((i) => list[i])
              const rest = list.filter((_, i) => !sources.includes(i))
              rest.splice(destination - sources.filter((i) => i < destination).length, 0, ...moved)
              reorder(rest)
            }}
            onDelete={(indices) => list[indices[0]] && confirmDelete(list[indices[0]])}
          >
            {list.map((server) => {
              const current = server.id === activeId
              const status = stateLabel(server)
              const row = (key?: string) => (
                <HStack key={key} spacing={10}>
                  {/* The whole row is this button; the info button keeps its own touch, being borderless. */}
                  {/* The button paints its whole label in its tint, so the tone goes there: the
                      name in it, the line under it a lighter shade of it. */}
                  <SwiftButton onPress={() => use(server)} modifiers={[tint(toneOf(server) ?? colors.text), ...(status ? [accessibilityValue(status)] : [])]}>
                    <HStack spacing={12}>
                      <Image systemName="checkmark" size={15} color={colors.accent} modifiers={[opacity(current ? 1 : 0)]} />
                      <VStack alignment="leading" spacing={2}>
                        <SwiftText modifiers={[lineLimit(1)]}>{nameOf(server)}</SwiftText>
                        {subtitle(server) ? (
                          <SwiftText modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(secondary), lineLimit(1)]}>
                            {subtitle(server)}
                          </SwiftText>
                        ) : null}
                      </VStack>
                    </HStack>
                  </SwiftButton>
                  <Spacer />
                  <SwiftButton
                    label={t('servers.open')}
                    systemImage="info.circle"
                    onPress={() => open(server)}
                    modifiers={[buttonStyle('borderless'), labelStyle('iconOnly'), tint(colors.accent)]}
                  />
                </HStack>
              )
              // In Edit the row is only itself: the long press of a context menu lifts the
              // row's preview as a drag of its own, which the list does not take as a move,
              // so the row followed the finger and could not be put down anywhere.
              if (editing) return row(server.id)
              return (
                // Out of Edit a long press is the menu, not the list's own drag.
                <SwipeActions key={server.id} modifiers={[moveDisabled(true)]}>
                  {/* The long press is the list's own menu of the row, as in the cast sheet. */}
                  <ContextMenu>
                    <ContextMenu.Items>{menuItemViews(menuOf(server))}</ContextMenu.Items>
                    <ContextMenu.Trigger>{row()}</ContextMenu.Trigger>
                  </ContextMenu>
                  {/* Not the destructive role: with it the row leaves the list before the question
                      is answered. */}
                  <SwipeActions.Actions edge="trailing">
                    <SwiftButton label={t('common.delete')} systemImage="trash" onPress={() => confirmDelete(server)} modifiers={[tint(colors.danger)]} />
                  </SwipeActions.Actions>
                </SwipeActions>
              )
            })}
          </List.ForEach>
          <NativeActionRow label={t('servers.add')} symbol="plus" onPress={add} />
        </NativeSection>

        {canEdit ? (
          <NativeSection footer={t('servers.failoverHint')}>
            <Toggle label={t('servers.failover')} isOn={failover} onIsOnChange={toggleFailover} />
          </NativeSection>
        ) : null}
      </NativeForm>
    )
  }

  const fallback = (
    <ReorderableList
      data={list}
      keyExtractor={(s) => s.id}
      onReorder={({ from, to }) => {
        const next = [...list]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        reorder(next)
      }}
      scrollEnabled={list.length > 0}
      contentContainerStyle={padding}
      ItemSeparatorComponent={ListSeparator}
      ListEmptyComponent={
        servers ? (
          <EmptyState
            title={t('servers.emptyTitle')}
            text={t('servers.emptyText')}
            action={<Button variant="glass" label={t('servers.add')} style={emptyButtonStyle} onPress={add} />}
          />
        ) : undefined
      }
      ListFooterComponent={
        canEdit ? (
          <View style={styles.footer}>
            <ListSection footer={<ListFooter>{t('servers.failoverHintDrag')}</ListFooter>}>
              <SwitchCell label={t('servers.failover')} value={failover} onValueChange={toggleFailover} />
            </ListSection>
          </View>
        ) : undefined
      }
      renderItem={({ item: server }) => {
        const current = server.id === activeId
        const tone = toneOf(server)
        const status = stateLabel(server)
        return (
          <ListCard onOpen={() => use(server)} onDelete={() => confirmDelete(server)} menu={menuOf(server)} menuTitle={nameOf(server)}>
            <View style={styles.row} accessibilityValue={status ? { text: status } : undefined}>
              <View style={styles.check}>{current ? <SFIcon name="checkmark" fallback="checkmark" size={18} color={colors.accent} /> : null}</View>
              <View style={styles.info}>
                <Text style={[styles.name, tone && { color: tone }]} numberOfLines={1}>
                  {nameOf(server)}
                </Text>
                {subtitle(server) ? (
                  <Text style={[styles.subtitle, tone && { color: tone, opacity: 0.7 }]} numberOfLines={1}>
                    {subtitle(server)}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => open(server)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('servers.open')}>
                <SFIcon name="info.circle" fallback="information-circle-outline" size={22} color={colors.accent} />
              </Pressable>
            </View>
          </ListCard>
        )
      }}
    />
  )

  return (
    <View style={styles.screen}>
      {servers && nativeForm ? renderNative(nativeForm) : fallback}
      <FormScreenHeader title={t('servers.title')} />
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    check: { width: 20, alignItems: 'center' },
    info: { flex: 1, gap: 2 },
    name: { fontSize: 16, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted },
    footer: { marginTop: 24 },
  })
