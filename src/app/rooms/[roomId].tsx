import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import ReorderableList from 'react-native-reorderable-list'

import { AvatarStack } from '@/components/cast/AvatarStack'
import { Avatar } from '@/components/visuals/Avatar'
import { Button } from '@/components/controls/Button'
import { ChatCard } from '@/components/lists/ChatCard'
import { EmptyState, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton, GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { GlassHeader, useScreenPadding } from '@/components/chrome/GlassHeader'
import { NativeMenu, type MenuItem } from '@/components/overlays/NativeMenu'
import { Icon } from '@/components/visuals/Icon'
import { listChats, pruneUntouchedChats, setChatOrder } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { getRoom, importChatToRoom, listRoomChats, listRoomMembers, type Room, type RoomChatPreview, type RoomMember } from '@/db/rooms'
import { useChatListActions, useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { showMessage, showSheet } from '@/lib/ui/dialogs'
import { formatWhen } from '@/lib/core/format'
import { fonts, HEADER_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

const IMPORT_CHOICES = 12

export default function RoomScenesScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>()
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const glass = useGlassStyles()
  const colors = useColors()
  const { t, locale } = useTranslation()
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [chats, setChats] = useState<RoomChatPreview[] | null>(null)

  const reload = useCallback(async () => {
    const found = await getRoom(db, Number(roomId))
    if (!found) return router.back()
    await pruneUntouchedChats(db)
    setRoom(found)
    setMembers(await listRoomMembers(db, found.id))
    setChats(await listRoomChats(db, found.id))
  }, [db, roomId, router])

  useReloadOnFocus(reload)
  const { duplicate, rename: promptRename, remove: confirmDelete } = useChatListActions(reload)

  const reorder = useReorder(chats, setChats, (ids) => setChatOrder(db, ids))

  const menuItems = (chat: RoomChatPreview): MenuItem[] => [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: () => promptRename(chat) },
    { label: t('chat.menuDuplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(chat) },
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(chat) },
  ]

  // Any one-on-one chat of a member can seed a scene here; the original stays put.
  const chooseImport = async () => {
    if (!room) return
    const found = (
      await Promise.all(
        members.map(async (m) => (await listChats(db, m.characterId)).map((chat) => ({ chat, name: m.character.name })))
      )
    )
      .flat()
      .filter(({ chat }) => chat.messageCount > 1)
      .sort((a, b) => b.chat.lastActivity - a.chat.lastActivity)
      .slice(0, IMPORT_CHOICES)
    if (!found.length) return showMessage(t('rooms.importNothingTitle'), t('rooms.importNothingMessage'))
    showSheet(
      t('rooms.importTitle'),
      found.map(({ chat, name }) => ({
        label: `${name}: ${chat.title ?? formatWhen(chat.lastActivity, locale)}`,
        onSelect: async () => {
          const { chatId } = await importChatToRoom(db, chat.id, room.id)
          router.push(`/chat/${chatId}`)
        },
      }))
    )
  }

  const cast = members.map((m) => ({ name: m.character.name, avatar: m.character.avatar }))

  const roomMenuItems: MenuItem[] = room
    ? [
        {
          label: t('rooms.importTitle'),
          systemImage: 'square.and.arrow.down',
          onSelect: chooseImport,
        },
        {
          label: t('settings.title'),
          systemImage: 'slider.horizontal.3',
          onSelect: () => router.push(`/room/${room.id}`),
        },
      ]
    : []

  return (
    <View style={styles.screen}>
      <ReorderableList
        data={chats ?? []}
        keyExtractor={(c) => String(c.id)}
        {...reorder}
        scrollEnabled={Boolean(chats?.length)}
        contentContainerStyle={padding}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          chats ? (
            <EmptyState
              title={t('rooms.scenesEmptyTitle')}
              text={t('rooms.scenesEmptyText')}
              action={
                <Link href={`/chat/new?room=${roomId}`} asChild>
                  <Button variant="glass" label={t('rooms.startScene')} style={emptyButtonStyle} />
                </Link>
              }
            />
          ) : null
        }
        renderItem={({ item: chat }) => (
          <ChatCard
            chat={{ ...chat, lastMessage: chat.lastSpeaker && chat.lastMessage ? `${chat.lastSpeaker}: ${chat.lastMessage}` : chat.lastMessage }}
            onOpen={() => router.push(`/chat/${chat.id}`)}
            onDelete={() => confirmDelete(chat)}
            menu={menuItems(chat)}
          />
        )}
      />
      <GlassHeader
        floating
        centerTitle
        left={
          <GlassButton
            icon="chevron-back"
            iconSize={26}
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
          />
        }
        right={
          room ? (
            <Link href={`/chat/new?room=${room.id}`} asChild>
              <GlassButton icon="add" iconSize={26} accessibilityLabel={t('rooms.startScene')} />
            </Link>
          ) : null
        }
      >
        {room ? (
          <NativeMenu items={roomMenuItems} style={styles.whoPress}>
            {cast.length > 1 ? (
              <View style={styles.imessageHeader}>
                <View style={styles.avatarRow}>
                  <AvatarStack cast={cast} size={34} max={3} viewable={false} />
                </View>
                <GlassSurface interactive style={styles.namePill} fallbackStyle={glass.solid}>
                  <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.imessageName} numberOfLines={1}>
                    {room.name}
                  </Text>
                  <Icon name="chevron-forward" size={11} color={colors.textMuted} />
                </GlassSurface>
              </View>
            ) : (
              <GlassSurface
                interactive
                style={[styles.whoPill, !cast.length && styles.whoPillNoAvatar]}
                fallbackStyle={glass.solid}
              >
                {cast.length === 1 ? (
                  <Avatar name={cast[0].name} file={cast[0].avatar} size={32} viewable={false} />
                ) : null}
                <View style={styles.nameRow}>
                  <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
                    {room.name}
                  </Text>
                  <Icon name="chevron-down" size={14} color={colors.textMuted} />
                </View>
              </GlassSurface>
            )}
          </NativeMenu>
        ) : null}
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    whoPress: { maxWidth: '100%', alignItems: 'center' },
    whoPill: {
      height: 44,
      borderRadius: 22,
      borderCurve: 'continuous',
      paddingLeft: 6,
      paddingRight: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      maxWidth: '100%',
    },
    whoPillNoAvatar: {
      paddingHorizontal: 16,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
    imessageHeader: {
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: '100%',
    },
    avatarRow: {
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    namePill: {
      height: 22,
      borderRadius: 11,
      borderCurve: 'continuous',
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      marginTop: -7,
      zIndex: 2,
      maxWidth: '100%',
    },
    imessageName: {
      flexShrink: 1,
      color: colors.text,
      fontFamily: fonts.prose,
      fontSize: 13,
      fontWeight: '600',
    },
  })
