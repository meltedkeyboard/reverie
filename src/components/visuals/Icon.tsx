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

import { isDesktop } from '@/lib/core/platform'

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

export function Icon(props: Props) {
  return isDesktop ? <LucideOrIonicon {...props} /> : <Ionicons {...props} />
}
