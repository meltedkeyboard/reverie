import { router } from 'expo-router'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { Avatar } from '@/components/visuals/Avatar'
import { Icon } from '@/components/visuals/Icon'
import { getCharacter } from '@/db/characters'
import { useDatabase } from '@/db/provider'
import { getRoom } from '@/db/rooms'
import { listSearchChats, type SearchChat } from '@/db/search'
import { useWindowKey } from '@/hooks/util/useWindowKey'
import { t, useTranslation } from '@/i18n'
import { onChatsChanged } from '@/lib/chat/chatEvents'
import { isElectron } from '@/lib/core/platform'
import { desktopBridge } from '@/lib/ui/desktopChrome'
import { useColors, useStyles, type Colors } from '@/theme'

// Tabs over the main column of the wide web layout, as in VS Code or Obsidian. A tab is
// only a route: going somewhere changes the route of the tab in front, a click with Ctrl
// (or the middle button) in the sidebar opens it in a tab of its own, and choosing a tab
// goes back to its route. Screens are not kept alive behind a tab, they load again.

type Tab = { id: number; path: string }
type TabsState = { tabs: Tab[]; active: number }

const TABS_KEY = 'reverie.tabs'

function readTabs(): TabsState {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(TABS_KEY) ?? 'null') as TabsState | null
    if (saved && Array.isArray(saved.tabs) && saved.tabs.length > 0) return saved
  } catch {}
  return { tabs: [{ id: 1, path: '/' }], active: 1 }
}

let state = readTabs()
let restored = false
const listeners = new Set<() => void>()

function setState(next: TabsState) {
  state = next
  try {
    globalThis.localStorage?.setItem(TABS_KEY, JSON.stringify(next))
  } catch {}
  listeners.forEach((listener) => listener())
}

function useTabs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state
  )
}

const nextId = () => Math.max(0, ...state.tabs.map((tab) => tab.id)) + 1

// The route the app is on now belongs to the tab in front.
function followRoute(path: string) {
  const active = state.tabs.find((tab) => tab.id === state.active)
  if (!active || active.path === path) return
  setState({ ...state, tabs: state.tabs.map((tab) => (tab.id === active.id ? { ...tab, path } : tab)) })
}

export function openInNewTab(path: string) {
  const tab = { id: nextId(), path }
  const at = state.tabs.findIndex((item) => item.id === state.active) + 1
  setState({ tabs: [...state.tabs.slice(0, at), tab, ...state.tabs.slice(at)], active: tab.id })
  router.navigate(path as never)
}

function selectTab(id: number) {
  const tab = state.tabs.find((item) => item.id === id)
  if (!tab || id === state.active) return
  setState({ ...state, active: id })
  router.navigate(tab.path as never)
}

// The last tab is never left empty: closing it opens the characters in its place.
// Closed routes, newest last, for Ctrl+Shift+T.
const closed: string[] = []

function closeTab(id: number) {
  const index = state.tabs.findIndex((tab) => tab.id === id)
  if (index < 0) return
  closed.push(state.tabs[index].path)
  if (closed.length > 20) closed.shift()
  const tabs = state.tabs.filter((tab) => tab.id !== id)
  if (tabs.length === 0) {
    setState({ tabs: [{ id: nextId(), path: '/' }], active: nextId() })
    router.navigate('/' as never)
    return
  }
  if (id !== state.active) return setState({ ...state, tabs })
  const next = tabs[Math.min(index, tabs.length - 1)]
  setState({ tabs, active: next.id })
  router.navigate(next.path as never)
}

function reopenClosed() {
  const path = closed.pop()
  if (path) openInNewTab(path)
}

// The n-th tab from 1; 9 is the last one, however many there are, as in browsers.
function selectNth(n: number) {
  const tab = n === 9 ? state.tabs[state.tabs.length - 1] : state.tabs[n - 1]
  if (tab) selectTab(tab.id)
}

// Moves the front tab one place left or right.
function moveTab(by: number) {
  const index = state.tabs.findIndex((tab) => tab.id === state.active)
  const to = index + by
  if (to < 0 || to >= state.tabs.length) return
  const tabs = [...state.tabs]
  ;[tabs[index], tabs[to]] = [tabs[to], tabs[index]]
  setState({ ...state, tabs })
}

function stepTab(by: number) {
  const index = state.tabs.findIndex((tab) => tab.id === state.active)
  const next = state.tabs[(index + by + state.tabs.length) % state.tabs.length]
  selectTab(next.id)
}

// Whether a click should open its target in a new tab: Ctrl or Cmd held, or the middle button.
export function wantsNewTab(event: unknown) {
  const e = ((event as { nativeEvent?: unknown })?.nativeEvent ?? event) as Partial<MouseEvent>
  return Boolean(e?.ctrlKey || e?.metaKey || e?.button === 1)
}

// The middle button gives no click on the web, only auxclick, which RN doesn't pass on.
export function useMiddleClick(onMiddle: () => void) {
  const ref = useRef<View>(null)
  const latest = useRef(onMiddle)
  latest.current = onMiddle
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null
    if (!el?.addEventListener) return
    // Without this the middle button starts the browser's autoscroll.
    const down = (e: MouseEvent) => e.button === 1 && e.preventDefault()
    const aux = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      latest.current()
    }
    el.addEventListener('mousedown', down)
    el.addEventListener('auxclick', aux)
    return () => {
      el.removeEventListener('mousedown', down)
      el.removeEventListener('auxclick', aux)
    }
  }, [])
  return ref
}

type IconName = ComponentProps<typeof Icon>['name']
type TabLabel = { title: string; icon?: IconName; avatar?: { name: string; file: string | null } }

const PLACES: Record<string, () => TabLabel> = {
  '/': () => ({ title: t('characters.title'), icon: 'people-outline' }),
  '/rooms': () => ({ title: t('rooms.title'), icon: 'chatbubbles-outline' }),
  '/search': () => ({ title: t('search.title'), icon: 'search-outline' }),
  '/settings': () => ({ title: t('settings.title'), icon: 'settings-outline' }),
  '/chat-text': () => ({ title: t('settings.appearance'), icon: 'color-palette-outline' }),
  '/app-icon': () => ({ title: t('settings.appIcon'), icon: 'apps-outline' }),
  '/about': () => ({ title: t('settings.aboutReverie'), icon: 'information-circle-outline' }),
  '/character/new': () => ({ title: t('editor.newCharacterTitle'), icon: 'person-add-outline' }),
  '/room/new': () => ({ title: t('roomEditor.newTitle'), icon: 'chatbubbles-outline' }),
}

// What a tab shows for its route. Chats come from the list the sidebar keeps too; a
// character or a room is looked up.
async function describe(db: ReturnType<typeof useDatabase>, path: string, chats: SearchChat[]): Promise<TabLabel> {
  const place = PLACES[path]
  if (place) return place()
  const [, kind, raw] = path.split('/')
  const id = Number(raw)
  if (kind === 'chat') {
    const chat = chats.find((item) => item.id === id)
    if (chat) return { title: chat.title ?? chat.ownerName, avatar: { name: chat.ownerName, file: chat.ownerAvatar } }
    return { title: t('sidebar.untitled'), icon: 'chatbubble-outline' }
  }
  if ((kind === 'chats' || kind === 'character') && id) {
    const character = await getCharacter(db, id)
    if (character) return { title: character.name, avatar: { name: character.name, file: character.avatar } }
  }
  if ((kind === 'rooms' || kind === 'room') && id) {
    const room = await getRoom(db, id)
    if (room) return { title: room.name, icon: 'chatbubbles-outline' }
  }
  return { title: 'Reverie', icon: 'document-outline' }
}

function useTabLabels(paths: string[]) {
  const db = useDatabase()
  const { t: tr } = useTranslation()
  const [chats, setChats] = useState<SearchChat[]>([])
  const [labels, setLabels] = useState<Record<string, TabLabel>>({})
  useEffect(() => {
    const reload = () => listSearchChats(db).then(setChats)
    reload()
    return onChatsChanged(reload)
  }, [db])
  const key = paths.join('\n')
  useEffect(() => {
    let live = true
    Promise.all(paths.map((path) => describe(db, path, chats))).then((found) => {
      if (live) setLabels(Object.fromEntries(paths.map((path, i) => [path, found[i]])))
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key, chats, tr])
  return labels
}

const ctrl = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey
const mac = desktopBridge()?.platform === 'darwin' || /Mac/.test(globalThis.navigator?.platform ?? '')

// The usual keys of browsers and editors. A browser keeps Ctrl+T, Ctrl+W, Ctrl+Shift+T and
// Ctrl+Tab for itself; in the desktop app they all reach the page, and Ctrl+W comes from
// the main process (onCloseTab), before the window's menu would close the window.
function tabKey(e: KeyboardEvent): (() => void) | null {
  if (!ctrl(e)) return null
  const key = e.key.toLowerCase()
  if (e.code === 'KeyT') return e.shiftKey ? reopenClosed : () => openInNewTab('/')
  if (e.code === 'KeyW' && !e.shiftKey && !isElectron) return () => requestClose(state.active)
  if (key === 'f4' && !e.shiftKey) return () => requestClose(state.active)
  if (key === 'tab') return () => stepTab(e.shiftKey ? -1 : 1)
  if (key === 'pagedown') return () => (e.shiftKey ? moveTab(1) : stepTab(1))
  if (key === 'pageup') return () => (e.shiftKey ? moveTab(-1) : stepTab(-1))
  // Cmd+Shift+] and [ on a Mac; e.code, since the key itself is } and { with Shift.
  if (mac && e.shiftKey && e.code === 'BracketRight') return () => stepTab(1)
  if (mac && e.shiftKey && e.code === 'BracketLeft') return () => stepTab(-1)
  // Ctrl+1 to 9 (Cmd on a Mac); by e.code, so a Russian layout or Shift doesn't change it.
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (digit && !e.shiftKey) return () => selectNth(Number(digit[1]))
  return null
}

// In the title bar a tab takes the pointer itself instead of dragging the window; the
// empty strip around the tabs still drags it, as in a browser.
const noDrag = { dataSet: { titlebar: 'nodrag' } } as object

// Closing goes through the bar while it is shown, so the tab can fold away first.
let animateClose: ((id: number) => void) | null = null
const requestClose = (id: number) => (animateClose ?? closeTab)(id)

const MOTION = { duration: 160, easing: Easing.out(Easing.cubic) }
// How far the pointer goes before a press on a tab becomes a drag.
const DRAG_SLOP = 4

type Drag = { id: number; dx: number; to: number; settling: boolean }
type Box = { x: number; width: number }

// Where a dragged tab would land: past every other tab whose middle it has crossed.
function dropIndex(tabs: Tab[], boxes: Record<number, Box>, id: number, dx: number) {
  const own = boxes[id]
  const center = own.x + own.width / 2 + dx
  return tabs.filter((tab) => tab.id !== id && boxes[tab.id] && boxes[tab.id].x + boxes[tab.id].width / 2 < center).length
}

// How far a tab steps aside to make room for the one dragged from `from` to `to`.
function shiftOf(index: number, from: number, to: number, width: number) {
  if (from < index && index <= to) return -width
  if (to <= index && index < from) return width
  return 0
}

// The strip of tabs; `pathname` is the route on screen, which it keeps the front tab on.
// `embedded` puts it into the desktop title bar, which gives it the grey and the line under it.
export function TabBar({ pathname, embedded = false }: { pathname: string; embedded?: boolean }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { tabs, active } = useTabs()
  const labels = useTabLabels(tabs.map((tab) => tab.path))
  const boxes = useRef<Record<number, Box>>({})
  const [drag, setDrag] = useState<Drag | null>(null)
  const [closing, setClosing] = useState<number[]>([])
  // Tabs there at the start are simply there; the ones opened later unfold.
  const [initial] = useState(() => new Set(state.tabs.map((tab) => tab.id)))

  useEffect(() => {
    followRoute(pathname)
  }, [pathname])

  // Back on a start at the bare address, the front tab's route is opened again. Once: the
  // bar also mounts anew after a full-screen route such as the viewer.
  useEffect(() => {
    if (restored) return
    restored = true
    const front = state.tabs.find((tab) => tab.id === state.active)
    if (front && front.path !== pathname && pathname === '/') router.replace(front.path as never)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    animateClose = (id) => setClosing((ids) => (ids.includes(id) ? ids : [...ids, id]))
    return () => {
      animateClose = null
    }
  }, [])

  useEffect(() => desktopBridge()?.onCloseTab?.(() => requestClose(state.active)), [])

  useWindowKey(
    (e) => tabKey(e) !== null,
    (e) => {
      const run = tabKey(e)
      if (!run) return
      e.preventDefault()
      run()
    }
  )

  const onClosed = (id: number) => {
    setClosing((ids) => ids.filter((item) => item !== id))
    closeTab(id)
  }

  const onDrag = (id: number, dx: number) => {
    if (!boxes.current[id]) return
    setDrag({ id, dx, to: dropIndex(state.tabs, boxes.current, id, dx), settling: false })
  }

  // The dragged tab glides into its new place, and only then the order changes.
  const onDrop = () => {
    if (!drag) return
    const from = state.tabs.findIndex((tab) => tab.id === drag.id)
    const { to } = drag
    const passed = to > from ? state.tabs.slice(from + 1, to + 1) : state.tabs.slice(to, from)
    const span = passed.reduce((sum, tab) => sum + (boxes.current[tab.id]?.width ?? 0), 0)
    setDrag({ ...drag, dx: to > from ? span : -span, settling: true })
    setTimeout(() => {
      if (to !== from) {
        const order = [...state.tabs]
        const [moved] = order.splice(from, 1)
        order.splice(to, 0, moved)
        setState({ ...state, tabs: order })
      }
      setDrag(null)
    }, MOTION.duration)
  }

  const dragFrom = drag ? tabs.findIndex((tab) => tab.id === drag.id) : -1
  const dragWidth = drag ? boxes.current[drag.id]?.width ?? 0 : 0

  return (
    <View style={embedded ? styles.embedded : styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            label={labels[tab.path]}
            active={tab.id === active}
            closable={tabs.length > 1 || tab.path !== '/'}
            appear={!initial.has(tab.id)}
            closing={closing.includes(tab.id)}
            dragging={drag?.id === tab.id ? drag : null}
            shift={drag && drag.id !== tab.id ? shiftOf(index, dragFrom, drag.to, dragWidth) : null}
            onLayout={(box) => {
              boxes.current[tab.id] = box
            }}
            onPress={() => selectTab(tab.id)}
            onClose={() => requestClose(tab.id)}
            onClosed={() => onClosed(tab.id)}
            onDrag={(dx) => onDrag(tab.id, dx)}
            onDrop={onDrop}
          />
        ))}
        <Pressable
          onPress={() => openInNewTab('/')}
          style={styles.add}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.new')}
          {...noDrag}
        >
          <Icon name="add" size={16} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </View>
  )
}

type ItemProps = {
  label?: TabLabel
  active: boolean
  closable: boolean
  // Unfolds from nothing when it mounts.
  appear: boolean
  // Folds away, then calls onClosed.
  closing: boolean
  // Set on the tab being dragged; `shift` on the others while a drag goes on.
  dragging: Drag | null
  shift: number | null
  onLayout: (box: Box) => void
  onPress: () => void
  onClose: () => void
  onClosed: () => void
  onDrag: (dx: number) => void
  onDrop: () => void
}

function TabItem(props: ItemProps) {
  const { label, active, closable, appear, closing, dragging, shift } = props
  const styles = useStyles(createStyles)
  const colors = useColors()
  const [hovered, setHovered] = useState(false)
  const ref = useMiddleClick(props.onClose)
  const latest = useRef(props)
  latest.current = props
  // A drag ends in a click on the tab, which must not count as choosing it.
  const dragged = useRef(false)

  const open = useSharedValue(appear ? 0 : 1)
  const offset = useSharedValue(0)
  useEffect(() => {
    open.value = withTiming(closing ? 0 : 1, MOTION)
    if (!closing) return
    const timer = setTimeout(() => latest.current.onClosed(), MOTION.duration)
    return () => clearTimeout(timer)
  }, [closing, open])
  // A layout effect: once a drop has changed the order, the offsets go back to zero in
  // the same frame as the tabs take their new places.
  useLayoutEffect(() => {
    if (dragging) offset.value = dragging.settling ? withTiming(dragging.dx, MOTION) : dragging.dx
    else if (shift !== null) offset.value = withTiming(shift, MOTION)
    else offset.value = 0
  }, [dragging, shift, offset])

  const motion = useAnimatedStyle(() => ({
    maxWidth: 220 * open.value,
    minWidth: 120 * open.value,
    opacity: open.value,
    transform: [{ translateX: offset.value }],
  }))

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null
    if (!el?.addEventListener) return
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const startX = e.clientX
      let moving = false
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        if (!moving && Math.abs(dx) < DRAG_SLOP) return
        moving = true
        dragged.current = true
        latest.current.onDrag(dx)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (moving) latest.current.onDrop()
        setTimeout(() => {
          dragged.current = false
        }, 0)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    el.addEventListener('pointerdown', down)
    return () => el.removeEventListener('pointerdown', down)
  }, [ref])

  return (
    <Animated.View
      ref={ref}
      style={[styles.slot, motion, dragging && styles.slotDragged]}
      {...noDrag}
      onLayout={(e) => props.onLayout({ x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Pressable
        onPress={() => !dragged.current && props.onPress()}
        style={[styles.tab, hovered && !active && styles.tabHovered, active && styles.tabActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
      >
        {label?.avatar ? (
          <Avatar name={label.avatar.name} file={label.avatar.file} size={16} viewable={false} />
        ) : (
          <Icon name={label?.icon ?? 'document-outline'} size={14} color={colors.textMuted} />
        )}
        <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
          {label?.title ?? ''}
        </Text>
        <Pressable
          onPress={() => !dragged.current && props.onClose()}
          hitSlop={4}
          style={[styles.close, { opacity: closable && (hovered || active) ? 1 : 0, pointerEvents: closable ? 'auto' : 'none' }]}
          accessibilityLabel={t('tabs.close')}
        >
          <Icon name="close" size={14} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  )
}

export const TAB_BAR_HEIGHT = 36

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
      height: TAB_BAR_HEIGHT,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    embedded: { flex: 1, height: TAB_BAR_HEIGHT, minWidth: 0 },
    strip: { alignItems: 'flex-end', height: TAB_BAR_HEIGHT, paddingLeft: 4 },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: TAB_BAR_HEIGHT - 5,
      minWidth: 120,
      maxWidth: 220,
      paddingLeft: 10,
      paddingRight: 5,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    // Clips the tab while it unfolds or folds away.
    slot: { overflow: 'hidden', marginBottom: -1 },
    slotDragged: { zIndex: 1 },
    tabHovered: { backgroundColor: colors.surfaceRaised },
    // The front tab joins the page under it: its fill, and no line between them.
    tabActive: { backgroundColor: colors.bg, borderColor: colors.border, borderBottomColor: colors.bg },
    title: { flex: 1, color: colors.textMuted, fontSize: 12.5 },
    titleActive: { color: colors.text },
    close: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    add: { width: 28, height: 28, marginLeft: 2, marginBottom: 3, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  })
