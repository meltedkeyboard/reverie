import Ionicons from '@expo/vector-icons/Ionicons'
import {
  Archive, ArrowDown, ArrowRight, ArrowUp, BookOpen, Brain, Camera, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, ChevronsUpDown, Circle, CircleCheck, CircleMinus, CirclePlay, Cloud, Code,
  Copy, Diamond, Download, Ear, Ellipsis, Expand, ExternalLink, Eye, EyeOff, FastForward, Files, Folder,
  Globe, GripHorizontal, Image, Images, Info, Languages, LayoutGrid, Library, Link, List, Lock, LogIn,
  LogOut, Menu, MessagesSquare, Mic, Palette, Pencil, Plus, Radio, RefreshCw, Repeat, Save, Scan,
  Search, Send, Server, Settings, Share, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Square,
  SquareCheck, SquarePen, Trash2, Triangle, TriangleAlert, Type, UploadCloud, User, UserPlus, Users,
  X, type LucideIcon,
} from 'lucide-react-native'
import type { ComponentProps } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'

import { isDesktop } from '@/lib/core/platform'
import { swiftUI } from '@/lib/ui/nativeUI'
import { useTheme } from '@/theme'

type Props = ComponentProps<typeof Ionicons>

// The desktop app draws Lucide; phones and the plain web page keep Ionicons.
// The names stay Ionicons' (the outline and filled forms share one Lucide glyph), so a call
// site does not know which set it gets. A name missing here falls back to Ionicons.
const LUCIDE: Record<string, LucideIcon> = {
  add: Plus,
  alert: TriangleAlert,
  apps: LayoutGrid,
  archive: Archive,
  'arrow-down': ArrowDown,
  'arrow-forward': ArrowRight,
  'arrow-up': ArrowUp,
  book: BookOpen,
  brain: Brain,
  camera: Camera,
  chatbubbles: MessagesSquare,
  checkbox: SquareCheck,
  checkmark: Check,
  'checkmark-circle': CircleCheck,
  'chevron-back': ChevronLeft,
  'chevron-down': ChevronDown,
  'chevron-expand': ChevronsUpDown,
  'chevron-forward': ChevronRight,
  'chevron-up': ChevronUp,
  close: X,
  cloud: Cloud,
  code: Code,
  'color-palette': Palette,
  copy: Copy,
  create: SquarePen,
  diamond: Diamond,
  documents: Files,
  download: Download,
  ear: Ear,
  ellipse: Circle,
  'ellipsis-horizontal': Ellipsis,
  enter: LogIn,
  exit: LogOut,
  expand: Expand,
  eye: Eye,
  'eye-off': EyeOff,
  folder: Folder,
  globe: Globe,
  image: Image,
  images: Images,
  'information-circle': Info,
  language: Languages,
  library: Library,
  link: Link,
  list: List,
  'lock-closed': Lock,
  menu: Menu,
  mic: Mic,
  open: ExternalLink,
  options: SlidersHorizontal,
  pencil: Pencil,
  people: Users,
  person: User,
  'person-add': UserPlus,
  'phone-portrait': Smartphone,
  'play-circle': CirclePlay,
  'play-forward': FastForward,
  push: UploadCloud,
  radio: Radio,
  refresh: RefreshCw,
  'remove-circle': CircleMinus,
  'reorder-two': GripHorizontal,
  repeat: Repeat,
  resize: Expand,
  save: Save,
  scan: Scan,
  search: Search,
  send: Send,
  server: Server,
  settings: Settings,
  share: Share,
  'shield-checkmark': ShieldCheck,
  sparkles: Sparkles,
  square: Square,
  stop: Square,
  text: Type,
  trash: Trash2,
  triangle: Triangle,
  warning: TriangleAlert,
}

function LucideOrIonicon(props: Props) {
  const { name, size = 24, color, style } = props
  const Glyph = LUCIDE[String(name).replace(/-(outline|sharp)$/, '')]
  if (!Glyph) return <Ionicons {...props} />
  // A light stroke: 1.75 at its usual 18 px, kept the same width at every size.
  return <Glyph size={size} color={color as string | undefined} strokeWidth={1.75} absoluteStrokeWidth style={style} />
}

// On iOS the same names are SF Symbols: [outline form, filled form]. The Ionicons name
// says which one (an "-outline" suffix or not); one symbol serves both where SF has no fill.
const SF: Record<string, [string, string]> = {
  add: ['plus', 'plus'],
  alert: ['exclamationmark.triangle', 'exclamationmark.triangle.fill'],
  apps: ['square.grid.2x2', 'square.grid.2x2.fill'],
  archive: ['archivebox', 'archivebox.fill'],
  'arrow-down': ['arrow.down', 'arrow.down'],
  'arrow-forward': ['arrow.right', 'arrow.right'],
  'arrow-undo': ['arrow.uturn.backward', 'arrow.uturn.backward'],
  'arrow-up': ['arrow.up', 'arrow.up'],
  book: ['book', 'book.fill'],
  brain: ['brain', 'brain.fill'],
  camera: ['camera', 'camera.fill'],
  chatbubble: ['bubble.left', 'bubble.left.fill'],
  chatbubbles: ['bubble.left.and.bubble.right', 'bubble.left.and.bubble.right.fill'],
  checkbox: ['checkmark.square', 'checkmark.square.fill'],
  checkmark: ['checkmark', 'checkmark'],
  'checkmark-circle': ['checkmark.circle', 'checkmark.circle.fill'],
  'chevron-back': ['chevron.left', 'chevron.left'],
  'chevron-down': ['chevron.down', 'chevron.down'],
  'chevron-expand': ['chevron.up.chevron.down', 'chevron.up.chevron.down'],
  'chevron-forward': ['chevron.right', 'chevron.right'],
  'chevron-up': ['chevron.up', 'chevron.up'],
  close: ['xmark', 'xmark'],
  cloud: ['cloud', 'cloud.fill'],
  code: ['chevron.left.forwardslash.chevron.right', 'chevron.left.forwardslash.chevron.right'],
  'color-palette': ['paintpalette', 'paintpalette.fill'],
  copy: ['doc.on.doc', 'doc.on.doc.fill'],
  create: ['square.and.pencil', 'square.and.pencil'],
  crop: ['crop', 'crop'],
  diamond: ['diamond', 'diamond.fill'],
  document: ['doc', 'doc.fill'],
  documents: ['doc.on.doc', 'doc.on.doc.fill'],
  download: ['square.and.arrow.down', 'square.and.arrow.down.fill'],
  ear: ['ear', 'ear.fill'],
  ellipse: ['circle', 'circle.fill'],
  'ellipsis-horizontal': ['ellipsis', 'ellipsis'],
  enter: ['rectangle.portrait.and.arrow.right', 'rectangle.portrait.and.arrow.right.fill'],
  exit: ['rectangle.portrait.and.arrow.forward', 'rectangle.portrait.and.arrow.forward.fill'],
  expand: ['arrow.up.left.and.arrow.down.right', 'arrow.up.left.and.arrow.down.right'],
  eye: ['eye', 'eye.fill'],
  'eye-off': ['eye.slash', 'eye.slash.fill'],
  folder: ['folder', 'folder.fill'],
  globe: ['globe', 'globe'],
  'hardware-chip': ['cpu', 'cpu.fill'],
  image: ['photo', 'photo.fill'],
  images: ['photo.on.rectangle', 'photo.fill.on.rectangle.fill'],
  'information-circle': ['info.circle', 'info.circle.fill'],
  language: ['character.bubble', 'character.bubble.fill'],
  library: ['books.vertical', 'books.vertical.fill'],
  link: ['link', 'link'],
  list: ['list.bullet', 'list.bullet'],
  'lock-closed': ['lock', 'lock.fill'],
  menu: ['line.3.horizontal', 'line.3.horizontal'],
  mic: ['mic', 'mic.fill'],
  open: ['arrow.up.right.square', 'arrow.up.right.square.fill'],
  options: ['slider.horizontal.3', 'slider.horizontal.3'],
  pencil: ['pencil', 'pencil'],
  people: ['person.2', 'person.2.fill'],
  person: ['person', 'person.fill'],
  'person-add': ['person.badge.plus', 'person.badge.plus.fill'],
  'phone-portrait': ['iphone', 'iphone'],
  'play-circle': ['play.circle', 'play.circle.fill'],
  'play-forward': ['forward', 'forward.fill'],
  pulse: ['waveform.path.ecg', 'waveform.path.ecg'],
  push: ['icloud.and.arrow.up', 'icloud.and.arrow.up.fill'],
  radio: ['dot.radiowaves.left.and.right', 'dot.radiowaves.left.and.right'],
  refresh: ['arrow.clockwise', 'arrow.clockwise'],
  'remove-circle': ['minus.circle', 'minus.circle.fill'],
  'reorder-three': ['line.3.horizontal', 'line.3.horizontal'],
  'reorder-two': ['line.2.horizontal', 'line.2.horizontal'],
  repeat: ['repeat', 'repeat'],
  resize: ['arrow.up.left.and.arrow.down.right', 'arrow.up.left.and.arrow.down.right'],
  save: ['square.and.arrow.down', 'square.and.arrow.down.fill'],
  scan: ['viewfinder', 'viewfinder'],
  search: ['magnifyingglass', 'magnifyingglass'],
  send: ['paperplane', 'paperplane.fill'],
  server: ['server.rack', 'server.rack'],
  settings: ['gearshape', 'gearshape.fill'],
  share: ['square.and.arrow.up', 'square.and.arrow.up.fill'],
  'shield-checkmark': ['checkmark.shield', 'checkmark.shield.fill'],
  sparkles: ['sparkles', 'sparkles'],
  square: ['square', 'square.fill'],
  stop: ['stop', 'stop.fill'],
  sync: ['arrow.triangle.2.circlepath', 'arrow.triangle.2.circlepath'],
  text: ['textformat', 'textformat'],
  toggle: ['switch.2', 'switch.2'],
  trash: ['trash', 'trash.fill'],
  triangle: ['triangle', 'triangle.fill'],
  warning: ['exclamationmark.triangle', 'exclamationmark.triangle.fill'],
}

function SymbolOrIonicon(props: Props) {
  const { name, size = 24, color, style } = props
  const { scheme } = useTheme()
  const outline = String(name).endsWith('-outline')
  const forms = SF[String(name).replace(/-(outline|sharp)$/, '')]
  if (!forms) return <Ionicons {...props} />
  const { Host, Image } = swiftUI!.ui
  // In the light scheme SwiftUI draws a white symbol dark despite the explicit color (see
  // SFIcon), so white ones are hosted in the dark scheme.
  const light = /^(#fff(fff)?|white|rgba?\(255, ?255, ?255)/i.test(String(color))
  // A symbol at a point size is about as tall as an Ionicons glyph of that size, but some
  // overhang it, so the host is larger than the box the layout sees and centered on it.
  const host = Math.round(size * 1.4)
  const offset = (size - host) / 2
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style as StyleProp<ViewStyle>]}>
      <Host style={{ position: 'absolute', width: host, height: host, top: offset, left: offset }} ignoreSafeArea="all" colorScheme={light ? 'dark' : scheme}>
        <Image systemName={forms[outline ? 0 : 1] as never} size={size * 0.85} color={color as string} />
      </Host>
    </View>
  )
}

export function Icon(props: Props) {
  if (isDesktop) return <LucideOrIonicon {...props} />
  return swiftUI ? <SymbolOrIonicon {...props} /> : <Ionicons {...props} />
}
