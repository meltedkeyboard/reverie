# Codebase map

Where things live and how they connect. For setup and features see the [README](../README.md).

Stack: Expo 57, React Native 0.86, expo-router, expo-sqlite, TypeScript (strict). Path alias `@/*` points to `src/`.

## Find it fast

| I want to change... | Go to |
|---|---|
| A request to the model, SSE parsing, thinking mode | `src/api/llm.ts` |
| How many messages are sent as context | `CONTEXT_WINDOW` in `src/api/llm.ts` |
| Send / regenerate / variants / edit / delete logic | `src/hooks/useChat.ts` (rooms: `src/hooks/useRoom.ts`) |
| Who speaks next in a room, whispers, eavesdropping | `src/lib/room/floor.ts`, `src/lib/room/audience.ts` |
| What a room character sees of the scene | `src/lib/room/prompt.ts` |
| The director request | `src/lib/room/director.ts` |
| Which actions a message has in its menu | `src/lib/messageActions.ts`, rendered in `src/components/MessageRow.tsx` |
| A DB column or a new table | new entry at the end of `MIGRATIONS` in `src/db/schema.ts`, then the matching `src/db/*.ts` file |
| Backup format | `src/lib/backup.ts` (`BACKUP_VERSION`, currently 7) |
| Auto chat title | `src/lib/titles.ts` |
| System prompt / greeting generator | `src/lib/promptGen.ts` and `src/components/PromptGenModal.tsx` |
| Colors, fonts, light/dark | `src/theme.tsx` |
| UI strings | `src/locales/en.json`, `src/locales/ru.json`; lookup in `src/i18n.tsx` |
| iOS permission texts | `app.json` plugins (English) and `permissions/ru.json` (Russian) |
| Tab bar: tabs, icons, web fallback | `app/(tabs)/_layout.tsx` |
| What search finds and in which order | `app/(tabs)/search/index.tsx` (`ORDER`, settings entries), queries in `src/db/search.ts` |
| Opening a chat at a message / Settings at a section | `?message=ID` in `chat/[id].tsx` → `focusId` in `ConversationList`; `?section=` in `(tabs)/settings.tsx` |
| Web-only behavior | files with a `.web.ts(x)` suffix |
| Brand assets and generated icons | `assets/brand/`, `scripts/build-icons.mjs` |
| CI build | `.github/workflows/ios.yml`, `build-ipa.sh` |

## Screens (`app/`)

File-based routes (expo-router). `_layout.tsx` is the root: it wires providers in this order:
`GestureHandlerRootView` > `StartupBoundary` > `KeyboardProvider` > `SQLiteProvider` (runs `migrate`) > locale and theme contexts > `AppLock` > `AppShell` (stack navigator, plus `Sidebar` on wide web).

The home screen is the `(tabs)` group. Its `_layout.tsx` keeps first-run users out (redirect to `/onboarding`) and renders `NativeTabs` from `expo-router/unstable-native-tabs`: the system tab bar, Liquid Glass on iOS 26, with Search as a separate `role="search"` tab. The web build of native tabs is a pill over the top of the page, so the web renders JS `Tabs` instead, with the bar hidden on wide web where the `Sidebar` leads everywhere. On iOS the tab screens set `disableAutomaticContentInsets` and pad themselves from `useSafeAreaInsets`, which inside a tab already includes the tab bar. Everything else is pushed on the root stack over the tabs.

| Route | File | Purpose |
|---|---|---|
| `/` | `(tabs)/index.tsx` | Characters tab: reorder, server notice, "Continue" capsule |
| `/rooms` | `(tabs)/rooms.tsx` | Rooms tab: reorder, "Continue" capsule |
| `/settings` | `(tabs)/settings.tsx` | Settings tab: server, theme, language, lock, haptics, private chat button, backup. `?section=` scrolls to a block and flashes it |
| `/search` | `(tabs)/search/index.tsx` | Search tab in its own stack, for the native header search bar (moved into the tab bar on iOS 26); a plain field on web |
| `/chats/:characterId` | `chats/[characterId].tsx` | Chats of one character |
| `/chat/:id` | `chat/[id].tsx` | The conversation (largest screen); a room's scene renders `RoomView` instead. `?message=ID` opens it scrolled to that message |
| `/rooms/:roomId` | `rooms/[roomId].tsx` | Scenes of one room, import of a member's chat |
| `/room/:id` | `room/[id].tsx` | Room editor: members, floor mode, scene, background |
| `/character/:id` | `character/[id].tsx` | Character editor: prompt, greeting, sampling, thinking mode, background |
| `/background` | `background.tsx` | Background picker, effect and intensity |
| `/onboarding` | `onboarding.tsx` | First-run pages, including server setup |
| `/viewer` | `viewer.tsx` | Full-screen image |
| `/about` | `about.tsx` | About page |

## Search

A Spotlight-like search over everything, in `(tabs)/search/index.tsx`.

- Characters, rooms (by name or a member's name) and chat titles are loaded whole on focus and matched in JS, where case folding works for Cyrillic. `listSearchChats` also serves the "Recent" list shown for an empty query.
- Message text is matched in SQL by `searchMessages` (`src/db/search.ts`), from two characters on, debounced. SQLite folds case only for ASCII, so the query is tried in four spellings (as typed, lower, capitalized, upper).
- Settings results are a static list of entries with keywords, each pointing at `/settings?section=…` (`SettingsSection` in `src/lib/searchScope.ts`).
- The order of sections follows the tab search was opened from: the tabs layout reports each focus to `noteTabFocus`, and search reads `getSearchScope` (`ORDER` in the screen).
- A message result opens `/chat/ID?message=ID`; `ConversationList` scrolls to the row (retrying while far rows are not rendered) and tints it with `Flash`. Settings blocks use the same `Flash`.

Some data cannot go through route params (file URIs, callbacks, very long data URLs), so two tiny module-level slots carry it between screens: `src/lib/backgroundDraft.ts` and `src/lib/viewer.ts`.

## Data flow of a chat

1. `chat/[id].tsx` loads the chat and character, then mounts `useChat`.
2. `useChat` builds the request: system prompt from the character, the last `CONTEXT_WINDOW` messages using the selected variants, images as `image_url` parts.
3. `streamChat` (`src/api/llm.ts`) yields `StreamPart`s: reply text and reasoning. `useChat` updates state per chunk and writes to the DB through `src/db/messages.ts`.
4. `regenerateTargetAt` decides what a regenerate replaces and which history the model sees.
5. After the first reply `autoName` calls `suggestTitle` and stores the title with `setChatTitle`.

A private chat uses an in-memory `MessageStore` inside `useChat` instead of the DB, so nothing is left after leaving the screen. The header button is toggled by `src/db/privateChat.ts`.

The streaming loop itself (reasoning, per-frame batching) is `runReplyStream` in `src/lib/replyStream.ts`, shared with rooms.

## Rooms

A room is a cast of characters (`room_members`) and settings; its chats are scenes (`chats.room_id`, with `character_id` NULL). `chat/[id].tsx` shows a scene with `src/components/RoomView.tsx`, driven by `useRoom`.

1. The user picks addressees or the narrator in `CastSheet` (opened from the button in `CastBar`) and may switch on a whisper there. A swipe to the left on a member in the sheet walks them out of the scene or back in. The message is saved with `addressees`, `audience`, `overheard` (rolled once from each member's perception) and `absent` (members out of the scene).
2. `planTurn` (`floor.ts`) scores the members and builds a queue for the room's floor mode: `addressee`, `reactions` or `open`. When the scores are too close it returns an `ambiguous` question, and `askDirector` asks the model with one short request (if the room allows it).
3. `useRoom.runQueue` generates the queued lines one by one. `buildRoomRequest` gives each speaker their own view: their lines as `assistant`, everyone else as `user` with a name in front, and nothing they could not hear (`hearing` in `audience.ts`). In open floor a line that calls another character by name queues their answer (`followUps`).
4. "Continue" and "Let them talk" use `nextSpeaker`; a nudge from the cast bar uses `turnFor`.

Members can be muted (listen only) or out of the scene (hear nothing); entering and leaving is recorded as a narrator line (`useRoom.setPresent`). With the director on, the characters move by themselves too: after every line `movementCue` (`floor.ts`) looks for words of going or coming, and only then `askMovement` (`director.ts`) asks who actually left or came in. In open floor whoever came in gets a turn to react.

## `src/db` - persistence

Everything goes through `expo-sqlite`. Schema versioning is `PRAGMA user_version` plus the ordered `MIGRATIONS` array in `schema.ts`. Never edit an existing entry, only append.

| File | Contents |
|---|---|
| `schema.ts` | Migrations: `characters`, `chats`, `messages`, `app_settings`, `rooms`, `room_members`. `migrate` runs them with foreign keys off, so a table rebuild does not cascade |
| `rooms.ts` | Room CRUD, members, scenes, `importChatToRoom` |
| `characters.ts` | Character CRUD, duplicate, ordering, `DEFAULT_SAMPLING`, `CHARACTER_COLUMNS` |
| `chats.ts` | Chat CRUD, duplicate, ordering, `pruneUntouchedChats`, `getLastChat` |
| `search.ts` | `listSearchChats` (every chat with its owner's name and avatar), `searchMessages` |
| `messages.ts` | Message CRUD, variants (`withNewVariant`, `withVariant`), images and thoughts as JSON columns |
| `settings.ts` | Key/value helpers (`getSetting`, `getFlag`), server settings, theme and locale preference |
| `appLock.ts`, `confirmDelete.ts`, `continue.ts`, `haptics.ts`, `onboarding.ts`, `privateChat.ts` | One feature flag each, stored as `'1'`/`'0'` in `app_settings` via `getFlag`/`setFlag` |

Flags that many call sites need synchronously keep an in-memory copy: `src/lib/hapticsState.ts`, `src/lib/confirmDelete.ts`, `isAppLockEnabledCached`.

## `src/lib` - logic without UI

| Group | Files |
|---|---|
| Images | `images.ts` (pick, resize to 1024 px JPEG, data URLs), `avatars.ts` (pick avatar/background, copy), `avatarStore.ts` / `.web.ts` (file or `localStorage` storage, avatars and backgrounds in separate folders) |
| Backup | `backup.ts` (export, import, wipe), `download.ts` / `.web.ts` (save JSON or image), `pickJson.ts` / `.web.ts` |
| Dialogs | `dialogs.tsx` (native alerts and sheets), `dialogs.web.tsx` (DOM implementation), `dialogs.types.ts`, `chatDialogs.ts` |
| Text | `roleplay.ts` (splits `*actions*` from speech, previews), `format.ts` (dates, plurals), `errors.ts` |
| AI helpers | `promptGen.ts`, `titles.ts` |
| Platform | `haptics.ts` / `.web.ts`, `nativeUI.ts` (optional SwiftUI and glass modules), `color.ts`, `storage.ts` / `.web.ts` (where the data lives, the "show in Files" toggle) |
| App | `version.ts` (the version shown in About and onboarding), `confirmDelete.ts` (delete that asks unless turned off), `searchScope.ts` (the tab search was opened from, `SettingsSection`) |
| Message menu | `messageActions.ts` |

## `src/hooks`

| Hook | Purpose |
|---|---|
| `useChat` | Conversation state, streaming, variants, editing |
| `useRoom` | A room scene: the speaker queue, director, autoplay, nudges |
| `useCharacterActions` | Duplicate / delete / export actions for a character |
| `useLastChat` | The chat behind the "Continue" capsule on the Characters and Rooms tabs |
| `useConnectionTest` | "Test connection" button state |
| `useReorder` | Drag-to-reorder lists (`react-native-reorderable-list`) |
| `useStoredFlag` | React state bound to an `app_settings` flag |
| `useAbortable` | `AbortController` tied to component lifetime |
| `useElapsedSeconds`, `useShake`, `useResponsive` | Timer, shake animation, wide-web check |

## `src/components`

- **Chat:** `MessageRow`, `Composer`, `ConversationList` (the inverted list, jump button, error card, scroll to `focusId`), `Flash` (fading tint behind what a screen was opened at), `AttachButton`, `ImageSourceMenu`, `TypingIndicator`, `ChatBackground`, `TextSheet` (text selection sheet on iOS).
- **Rooms:** `RoomView`, `CastBar`, `CastSheet`, `AvatarStack`, `RoomCard`.
- **Lists:** `CharacterCard`, `ChatCard`, `ListCard`, `SwipeToDelete`, `ContinueButton`, `EmptyState`, `Sidebar` (wide web).
- **Forms:** `Field`, `Group`, `ToggleRow`, `Segmented`, `ChipGroup`, `ParamSlider`, `FormScreenHeader`, `PromptGenModal`.
- **Chrome and glass:** `Glass`, `GlassHeader` (also `TabTitle`, the star title of the tabs), `BarChrome`, `NativeMenu`, `PageSheet`, `BottomSheet`, `IconButton`, `Button`, `SFIcon`.
- **App-level:** `AppLock` (Face ID gate), `StartupBoundary` (shows DB open errors), `Pager` (onboarding), `Avatar`, `ImageLink`, `HomePattern`, `Wordmark`.
- **`motifs/`:** small brand decorations (`Shard*`, `Star*`, `Divider`, `Eyebrow`, `FieldRow`).

## Platform split

`Foo.ts` is the native implementation and `Foo.web.ts` the browser one, resolved by Metro. Pairs: `avatarStore`, `download`, `dialogs`, `haptics`, `pickJson`, `storage`. Keep their exported signatures identical.

## Conventions

- Screens stay thin: data access in `src/db`, logic in `src/lib` or hooks.
- Strings always go through `t('key')`; add the key to both locale files.
- New setting flag: new `src/db/<name>.ts` with `getFlag`/`setFlag`, a row in `(tabs)/settings.tsx`, strings in both locales. To make it findable, wrap the row in `block('<section>', …)`, add the id to `SettingsSection` and an entry to the settings list in `(tabs)/search/index.tsx`.
- New column: append a migration, extend the `*_COLUMNS` constant and the type, and bump `BACKUP_VERSION` in `backup.ts` if the backup should carry it (older backups must still import).
- Check types with `npm run typecheck`.
