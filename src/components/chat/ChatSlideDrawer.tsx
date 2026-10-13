import { createContext, useCallback, useContext, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import type { Character } from '@/db/characters'
import type { Room } from '@/db/rooms'
import { Sidebar } from '@/components/chrome/Sidebar'
import { useLayoutMode } from '@/hooks/util/useLayoutMode'
import { useColors } from '@/theme'

export type ChatDrawerContextType = {
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  isOpen: boolean
}

export const ChatDrawerContext = createContext<ChatDrawerContextType | null>(null)
export const useChatDrawer = () => useContext(ChatDrawerContext)

const SPRING = { damping: 24, stiffness: 320, mass: 0.75 }

function dismissKeyboard() {
  Keyboard.dismiss()
}

type Props = {
  children: React.ReactNode
  character?: Character | null
  room?: Room | null
  onSwitchChat?: (chatId: number) => void
  onNewChat?: () => void
}

export function ChatSlideDrawer({ children, character, room, onSwitchChat, onNewChat }: Props) {
  const wide = useLayoutMode() === 'wide'
  const colors = useColors()
  const { width: screenWidth } = useWindowDimensions()
  const drawerWidth = Math.min(300, Math.round(screenWidth * 0.82))

  const offset = useSharedValue(0)
  const startOffset = useSharedValue(0)
  const [isOpen, setIsOpen] = useState(false)
  const isOpenShared = useSharedValue(false)

  const openDrawer = useCallback(() => {
    Keyboard.dismiss()
    offset.value = withSpring(drawerWidth, SPRING)
    isOpenShared.value = true
    setIsOpen(true)
  }, [drawerWidth, offset, isOpenShared])

  const closeDrawer = useCallback(() => {
    Keyboard.dismiss()
    offset.value = withSpring(0, SPRING)
    isOpenShared.value = false
    setIsOpen(false)
  }, [offset, isOpenShared])

  const toggleDrawer = useCallback(() => {
    if (isOpenShared.value) {
      closeDrawer()
    } else {
      openDrawer()
    }
  }, [closeDrawer, openDrawer, isOpenShared])

  // Swiping from the left side slides the chat open to reveal the drawer effortlessly
  const openGesture = Gesture.Pan()
    .activeOffsetX([8, 1000])
    .failOffsetY([-40, 40])
    .hitSlop({ left: 0, width: 140 })
    .onTouchesDown((e, manager) => {
      if (e.allTouches[0] && e.allTouches[0].x > 140) {
        manager.fail()
      }
    })
    .onBegin(() => {
      scheduleOnRN(dismissKeyboard)
      startOffset.value = offset.value
    })
    .onUpdate((e) => {
      const next = startOffset.value + e.translationX
      offset.value = Math.max(0, Math.min(drawerWidth, next))
    })
    .onEnd((e) => {
      if (offset.value > drawerWidth * 0.18 || e.velocityX > 180) {
        offset.value = withSpring(drawerWidth, SPRING)
        isOpenShared.value = true
        scheduleOnRN(setIsOpen, true)
      } else {
        offset.value = withSpring(0, SPRING)
        isOpenShared.value = false
        scheduleOnRN(setIsOpen, false)
      }
    })

  // Swiping left on the shifted chat closes the drawer
  const closeGesture = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onBegin(() => {
      startOffset.value = offset.value
    })
    .onUpdate((e) => {
      const next = startOffset.value + e.translationX
      offset.value = Math.max(0, Math.min(drawerWidth, next))
    })
    .onEnd((e) => {
      if (offset.value < drawerWidth * 0.82 || e.velocityX < -180) {
        offset.value = withSpring(0, SPRING)
        isOpenShared.value = false
        scheduleOnRN(setIsOpen, false)
      } else {
        offset.value = withSpring(drawerWidth, SPRING)
        isOpenShared.value = true
        scheduleOnRN(setIsOpen, true)
      }
    })

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value - drawerWidth }],
  }))

  const chatAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, drawerWidth], [0, 0.45]),
  }))

  const contextValue = {
    openDrawer,
    closeDrawer,
    toggleDrawer,
    isOpen,
  }

  // On wide screens (desktop / tablet) the sidebar is permanently docked in _layout
  if (wide) {
    return (
      <ChatDrawerContext.Provider value={contextValue}>
        {children}
      </ChatDrawerContext.Provider>
    )
  }

  return (
    <ChatDrawerContext.Provider value={contextValue}>
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {/* The Sidebar on the left */}
        <Animated.View style={[styles.drawer, { width: drawerWidth }, drawerAnimatedStyle]}>
          <Sidebar
            drawer
            character={character}
            room={room}
            onSelect={closeDrawer}
            onSwitchChat={onSwitchChat}
            onNewChat={onNewChat}
          />
        </Animated.View>

        {/* The Chat view pushed/shifted to the right */}
        <GestureDetector gesture={openGesture}>
          <Animated.View style={[styles.chat, { width: screenWidth, backgroundColor: colors.bg }, chatAnimatedStyle]}>
            {children}
            <Animated.View
              style={[styles.overlay, overlayAnimatedStyle]}
              pointerEvents={isOpen ? 'auto' : 'none'}
            >
              <GestureDetector gesture={closeGesture}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
              </GestureDetector>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </ChatDrawerContext.Provider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  chat: {
    flex: 1,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 99,
  },
})
