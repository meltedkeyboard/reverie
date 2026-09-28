# Codebase map

Where things live and how they connect. For setup and features see the [README](README.md).

Stack: Expo 57, React Native 0.86, expo-router, expo-sqlite, TypeScript (strict). iOS only. Path alias `@/*` points to `src/`.

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
| Long text fields of the editors and their full-screen editor | `FieldRow` with `expandTitle`, `app/text-editor.tsx`, `src/lib/textDraft.ts` |
| UI strings | `src/locales/en.json`, `src/locales/ru.json`; lookup in `src/i18n.tsx` |
| iOS permission texts | `app.json` plugins (English) and `permissions/ru.json` (Russian) |
| Tab bar: tabs, icons | `app/(tabs)/_layout.tsx` |
| What search finds and in which order | `app/(tabs)/search/index.tsx` (`ORDER`, settings entries), queries in `src/db/search.ts` |
| Opening a chat at a message / Settings at a section | `?message=ID` in `chat/[id].tsx` → `focusId` in `ConversationList`; `?section=` in `(tabs)/settings.tsx` |
| iCloud sync: when it runs, what goes up, conflicts | `src/lib/cloudSync.ts`, the provider in `src/hooks/useCloudSync.tsx`, the native folder in `modules/reverie-cloud-folder` |
| Where the data lives, the "show in Files" toggle | `src/lib/storage.ts` (folders, startup settling) and `src/db/provider.tsx` (live switch) |
| Brand assets and generated icons | `assets/brand/`, `scripts/build-icons.mjs` |
| CI build | `.github/workflows/ios.yml`, `build-ipa.sh` |

## Screens (`app/`)

File-based routes (expo-router). `_layout.tsx` is the root: it wires providers in this order:
`GestureHandlerRootView` > `StartupBoundary` > `KeyboardProvider` > `DatabaseProvider` (`src/db/provider.tsx`, opens the DB and runs `migrate`) > locale and theme contexts > `CloudSyncProvider` > `AppLock` > `AppShell` (stack navigator).

The home screen is the `(tabs)` group. Its `_layout.tsx` keeps first-run users out (redirect to `/onboarding`) and renders `NativeTabs` from `expo-router/unstable-native-tabs`: the system tab bar, Liquid Glass on iOS 26, with Search as a separate `role="search"` tab. The tab screens set `disableAutomaticContentInsets` and pad themselves from `useSafeAreaInsets`, which inside a tab already includes the tab bar. Everything else is pushed on the root stack over the tabs.

| Route | File | Purpose |
|---|---|---|
| `/` | `(tabs)/index.tsx` | Characters tab: reorder, server notice |
| `/rooms` | `(tabs)/rooms.tsx` | Rooms tab: reorder |
| `/settings` | `(tabs)/settings.tsx` | Settings tab: server, theme, language, Continue capsule and where it leads, lock, haptics, private question button, iCloud sync, backup. `?section=` scrolls to a block and flashes it |
| `/search` | `(tabs)/search/index.tsx` | Search tab in its own stack, for the native header search bar (moved into the tab bar on iOS 26) |
| `/chats/:characterId` | `chats/[characterId].tsx` | Chats of one character; the info button opens the character's profile |
| `/chat/:id` | `chat/[id].tsx` | The conversation (largest screen); a room's scene renders `RoomView` instead. `?message=ID` opens it scrolled to that message |
| `/rooms/:roomId` | `rooms/[roomId].tsx` | Scenes of one room, import of a member's chat |
| `/room/:id` | `room/[id].tsx` | Room editor: members, floor mode, scene, background |
| `/character/:id` | `character/[id].tsx` | Character editor. With `?profile=1` (the info button of the chats list) it opens as a read-only profile, `CharacterProfile`, in the manner of Telegram: the pencil in the header turns into the save checkmark (`BarButton` with `animateChange`), and saving returns to the profile. The editor: prompt, greeting, sampling, thinking mode, background. The avatar spreads into a full-width photo on a pull (`ExpandingAvatar`, fed the scroll offset by `useAnimatedScrollHandler`), the drawn header giving way and the name moving onto the photo. Transforms only: the photo is laid out full size and scaled into the circle, and `useSpreadPush` moves the form down, since animating sizes re-laid out the form every frame |
| `/background` | `background.tsx` | Background picker, effect and intensity |
| `/avatar-crop` | `avatar-crop.tsx` | Moving and pinching an avatar picked from Files under a round window; the library and the camera crop in the system editor instead |
| `/text-editor` | `text-editor.tsx` | A long form text (system prompt, greeting, scene) on the whole screen, like a note; each change goes straight back to the form. Opens without the keyboard; a wrapper takes the JS touch (`onStartShouldSetResponderCapture`), because `TextInput` focuses itself when any touch ends, a scroll included |
| `/onboarding` | `onboarding.tsx` | First-run pages, including server setup |
| `/viewer` | `viewer.tsx` | Full-screen images: pinch and double-tap zoom, swipe between several (a room's cast) |
| `/about` | `about.tsx` | About page |

## Search

A Spotlight-like search over everything, in `(tabs)/search/index.tsx`.

- Characters, rooms (by name or a member's name) and chat titles are loaded whole on focus and matched in JS, where case folding works for Cyrillic. `listSearchChats` also serves the "Recent" list shown for an empty query.
- Message text is matched in SQL by `searchMessages` (`src/db/search.ts`), from two characters on, debounced. SQLite folds case only for ASCII, so the query is tried in four spellings (as typed, lower, capitalized, upper).
- Settings results are a static list of entries with keywords, each pointing at `/settings?section=…` (`SettingsSection` in `src/lib/searchScope.ts`).
- The order of sections follows the tab search was opened from: the tabs layout reports each focus to `noteTabFocus`, and search reads `getSearchScope` (`ORDER` in the screen).
- A message result opens `/chat/ID?message=ID`; `ConversationList` scrolls to the row (retrying while far rows are not rendered) and tints it with `Flash`. Settings blocks use the same `Flash`.

Some data cannot go through route params (file URIs, callbacks, very long data URLs), so tiny module-level slots carry it between screens: `src/lib/backgroundDraft.ts`, `src/lib/avatarCrop.ts`, `src/lib/textDraft.ts` and `src/lib/viewer.ts`.

Every avatar opens the viewer: `Avatar` and `AvatarStack` (the whole cast, via `castGallery`) wrap themselves in `ImageLink` unless `viewable={false}`. In a list row that opens something, the avatar keeps its own tap (the rest of the row still opens). `viewable={false}` is for places where the tap on the avatar itself must do something else: a header menu trigger, the cast button, a cast sheet row, the Continue capsule, the character picker in the room editor. Where it matters, the photo is offered as a menu item through `useOpenViewer` instead.

## Data flow of a chat

1. `chat/[id].tsx` loads the chat and character, then mounts `useChat`.
2. `useChat` builds the request: system prompt from the character, the last `CONTEXT_WINDOW` messages using the selected variants, images as `image_url` parts.
3. `streamChat` (`src/api/llm.ts`) yields `StreamPart`s: reply text and reasoning. `useChat` updates state per chunk and writes to the DB through `src/db/messages.ts`.
4. `regenerateTargetAt` decides what a regenerate replaces and which history the model sees.
5. After the first reply `autoName` calls `suggestTitle` and stores the title with `setChatTitle`. The title is asked for with thinking off, regardless of the character; if the model still answers with nothing, it is asked again with the server default and a larger budget.

The eye in the header of a chat or a scene opens Private: a question to the model beside the story, like `/btw`. `useAside` keeps the thread in memory, `buildAsideRequest` (`src/lib/aside.ts`) sends the scene brief and a text transcript of the latest lines (text, not assistant/user turns, so the model does not carry on in character), and `AsidePanel` shows it in the composer's `accessory` slot, so it rides the keyboard with the field. Opening and closing swaps the whole field through `ComposerSwap` (`Composer.tsx`): the old one sinks, the new one springs up, and the chat's draft is kept in `initialText`/`onTextChange`. Nothing of it is saved or reaches the characters; closing the eye throws it away. The button is toggled by `src/db/privateChat.ts`.

The streaming loop itself (reasoning, per-frame batching) is `runReplyStream` in `src/lib/replyStream.ts`, shared with rooms.

## Rooms

A room is a cast of characters (`room_members`) and settings; its chats are scenes (`chats.room_id`, with `character_id` NULL). `chat/[id].tsx` shows a scene with `src/components/RoomView.tsx`, driven by `useRoom`.

1. The user picks addressees or the narrator in `CastSheet` (opened from the button in `CastBar`) and may switch on a whisper there. A swipe to the left on a member in the sheet walks them out of the scene or back in. The message is saved with `addressees`, `audience`, `overheard` (rolled once from each member's perception) and `absent` (members out of the scene).
2. `planTurn` (`floor.ts`) scores the members and builds a queue for the room's floor mode: `addressee`, `reactions` or `open`. When the scores are too close it returns an `ambiguous` question, and `askDirector` asks the model with one short request (if the room allows it).
3. `useRoom.runQueue` generates the queued lines one by one. `buildRoomRequest` gives each speaker their own view: their lines as `assistant`, everyone else as `user` with a name in front, and nothing they could not hear (`hearing` in `audience.ts`). In open floor a line that calls another character by name queues their answer (`followUps`).
4. "Continue" and "Let them talk" use `nextSpeaker`; a nudge from the cast bar uses `turnFor`.

Members can be muted (listen only) or out of the scene (hear nothing); entering and leaving is recorded as a narrator line (`useRoom.setPresent`). With the director on, the characters move by themselves too: after every line `movementCue` (`floor.ts`) looks for words of going or coming, and only then `askMovement` (`director.ts`) asks who actually left or came in. In open floor whoever came in gets a turn to react.

## `src/db` - persistence

Everything goes through `expo-sqlite`. Components get the database from `useDatabase()` (`provider.tsx`), not from expo-sqlite's `useSQLiteContext`. Schema versioning is `PRAGMA user_version` plus the ordered `MIGRATIONS` array in `schema.ts`. Never edit an existing entry, only append.

| File | Contents |
|---|---|
| `provider.tsx` | `DatabaseProvider`, `useDatabase`, `useShowInFiles`, `useReloadDatabase` (the same file on a new connection, after an iCloud pull). Replaces expo-sqlite's `SQLiteProvider` so the database can be swapped for one in another folder without remounting the app |
| `schema.ts` | Migrations: `characters`, `chats`, `messages`, `app_settings`, `rooms`, `room_members`. `migrate` runs them with foreign keys off, so a table rebuild does not cascade |
| `rooms.ts` | Room CRUD, members, scenes, `importChatToRoom` |
| `characters.ts` | Character CRUD, duplicate, ordering, `DEFAULT_SAMPLING`, `CHARACTER_COLUMNS` |
| `chats.ts` | Chat CRUD, duplicate, ordering, `pruneUntouchedChats`, `getLastChat` |
| `search.ts` | `listSearchChats` (every chat with its owner's name and avatar), `searchMessages` |
| `messages.ts` | Message CRUD, variants (`withNewVariant`, `withVariant`), images and thoughts as JSON columns |
| `settings.ts` | Key/value helpers (`getSetting`, `getFlag`), server settings, theme and locale preference |
| `appLock.ts`, `confirmDelete.ts`, `haptics.ts`, `onboarding.ts`, `privateChat.ts` | One feature flag each, stored as `'1'`/`'0'` in `app_settings` via `getFlag`/`setFlag` |
| `cloudSync.ts` | iCloud sync state, local only: on/off, `sync_dirty` (set by triggers on the synced tables, see the last migration), the revision last synced and when |
| `continue.ts` | The Continue capsule: on/off, last visited or last message (`isContinueByVisit`), swiped away per kind, and the id of the chat opened last per kind (`setLastOpened`, written by `chat/[id].tsx`) |

Flags that many call sites need synchronously keep an in-memory copy: `src/lib/hapticsState.ts`, `src/lib/confirmDelete.ts`, `isAppLockEnabledCached`.

## Data on disk

`src/lib/storage.ts` decides where the database (`SQLite/reverie.db`) and the `avatars` and `backgrounds` folders live: in Documents, which the Files app shows, or in the private `Library/Reverie` (a dot-folder in Documents under Expo Go). A `show-in-files` marker file in the private folder says which one.

- The private folder path must not contain a space: expo-sqlite parses the directory with `URL(string:)`, which on iOS 17+ turns a space into `%20` and opens a new empty database elsewhere. Versions 2.2 to 3.0 had exactly this bug with `Library/Application Support/Reverie`.
- `settle()` runs once on import, before the database opens. It moves the files to where the marker says and picks up what older versions left behind (`Application Support/Reverie`, `Application%20Support/Reverie`, Documents). If several databases turn up, the one the app was last showing is kept, and the others are moved to `Library/Reverie/earlier-databases/`, never deleted.
- The toggle works without a restart: `useShowInFiles` calls `moveStorage`, which copies the open database with `VACUUM INTO`, moves the images and flips the marker. Then `DatabaseProvider` opens the copy and hands it down in place of the old one, and screens reload through their `[db]` effects. The old database is closed after that re-render, and `discardInactiveDatabase` removes it.

## iCloud sync

A folder picked in iCloud Drive, not the iCloud entitlement: that one needs a paid developer account, and the app is signed with a free Apple ID. `modules/reverie-cloud-folder` is a local Expo module (autolinked from `modules/`): it shows the folder picker, keeps a bookmark in `UserDefaults`, and does every read and write under `NSFileCoordinator`, which is what makes iCloud download a placeholder and upload a new file. It is missing in Expo Go, and then the Settings block is hidden (`cloudSyncAvailable`).

- In the folder: `manifest.json` (the revision, written last), `reverie.db` (a `VACUUM INTO` snapshot with `app_settings` removed under `secure_delete`, so the API key never leaves the device) and `avatars/`, `backgrounds/` by their unique names.
- A device remembers the revision it last matched (`sync_rev`) and whether anything changed since (`sync_dirty`). Only one side changed: it wins. Both: a sheet asks which one to keep, and if it is iCloud's, the local database is first put aside in `earlier-databases` (`keepCopy` in `storage.ts`).
- A pull writes the rows straight into the open database from the attached copy (older copies are migrated first, newer ones refused), then `useReloadDatabase` hands the screens a new connection. The database in iCloud is never opened in place.
- `CloudSyncProvider` syncs on start and on coming to the front, and pushes on going to the background. Quiet runs only log errors; "Sync now" shows them.
- Sync uses a connection of its own: `ATTACH` fails inside a transaction, and the app's connection may be in one.

## `src/lib` - logic without UI

| Group | Files |
|---|---|
| Images | `images.ts` (pick, resize to 1024 px JPEG, data URLs), `avatars.ts` (pick avatar/background, `squareAvatar` cuts a given square, copy), `avatarStore.ts` (files, avatars and backgrounds in separate folders) |
| Backup | `backup.ts` (export, import, wipe), `download.ts` (save JSON through the Files "Save as" sheet from `modules/reverie-save-as`, or to a picked folder without it, an image straight to Photos with `expo-media-library`, add-only permission), `pickJson.ts` |
| Dialogs | `dialogs.tsx` (native alerts and sheets), `chatDialogs.ts` |
| Text | `roleplay.ts` (splits `*actions*` from speech, previews), `format.ts` (dates, plurals), `errors.ts` |
| AI helpers | `promptGen.ts`, `titles.ts`, `aside.ts` (the Private request, `characterScene`/`roomScene`) |
| Platform | `haptics.ts`, `nativeUI.ts` (optional SwiftUI and glass modules), `color.ts`, `storage.ts` (where the data lives, the "show in Files" toggle, see below) |
| Sync | `cloudSync.ts` (iCloud Drive folder sync, see above) |
| App | `version.ts` (the version shown in About and onboarding), `confirmDelete.ts` (delete that asks unless turned off), `searchScope.ts` (the tab search was opened from, `SettingsSection`) |
| Message menu | `messageActions.ts` |

## `src/hooks`

| Hook | Purpose |
|---|---|
| `useChat` | Conversation state, streaming, variants, editing |
| `useRoom` | A room scene: the speaker queue, director, autoplay, nudges |
| `useAside` | The Private thread with the model beside a chat or a scene, in memory only |
| `useCharacterActions` | Duplicate / delete / export actions for a character |
| `useLastChat` | The chat behind the "Continue" capsule on the Characters and Rooms tabs: the one opened last, or the one written in last, as set in Settings. Chats without a user message never count. `LastChatProvider` in the tabs layout holds both kinds for the one shared button; `useContinueAnchor` on a tab's root view tells it where the content ends (inside a tab the safe area includes the tab bar); only the focused tab reports, re-measuring on focus and every half second |
| `useConnectionTest` | "Test connection" button state |
| `useReorder` | Drag-to-reorder lists (`react-native-reorderable-list`) |
| `useStoredFlag` | React state bound to an `app_settings` flag |
| `useAbortable` | `AbortController` tied to component lifetime |
| `useElapsedSeconds`, `useShake` | Timer, shake animation |

## `src/components`

- **Chat:** `MessageRow`, `Composer`, `ConversationList` (the inverted list, jump button, error card, scroll to `focusId`), `Flash` (fading tint behind what a screen was opened at), `AttachButton`, `ImageSourceMenu`, `TypingIndicator`, `ChatBackground`, `TextSheet` (text selection sheet: message bubbles aren't selectable, the long press opens the menu), `AsidePanel` (Private).
- **Rooms:** `RoomView`, `CastBar`, `CastSheet`, `AvatarStack`, `RoomCard`. `Check` is the checkmark of a picked sheet row, shared with `ModelSheet`.
- **Lists:** `CharacterCard`, `ChatCard`, `ListCard`, `SwipeToDelete`, `ContinueButton` (one for both home tabs, drawn by `(tabs)/_layout.tsx` over them as `HomeContinueButton`; slides its content out and in when it comes to lead to another chat; on a switch between Characters and Rooms the content just changes), `EmptyState`.
- **Forms:** `Field`, `ToggleRow`, `Segmented`, `ChipGroup` (a row of `Chip`), `ParamSlider`, `FormScreenHeader`, `PromptGenModal`, `PickerBox` (a field chosen from a sheet rather than typed; `FieldRow` with `onPress`), `ModelSheet` (the server's models, one to a row, in Settings and onboarding once the connection test has listed them).
- **Chrome and glass:** `Glass`, `GlassHeader` (also `TabTitle`, the star title of the tabs), `BarChrome`, `NativeMenu`, `PageSheet`, `BottomSheet`, `IconButton`, `Button`, `PillButton`, `Chip`, `SFIcon`.
- **App-level:** `AppLock` (Face ID gate), `StartupBoundary` (shows DB open errors), `Pager` (onboarding), `Avatar`, `ExpandingAvatar` (the character editor's), `ImageLink`, `HomePattern`, `Wordmark`.
- **`motifs/`:** small brand decorations (`Star*`, `Divider`, `Eyebrow`, `FieldRow`).

### Liquid Glass

On iOS 26 the controls are Liquid Glass through `GlassSurface` in `Glass.tsx`; it takes a `fallbackStyle` for older iOS, where the same control is the plain surface with a hairline. `nativeUI.ts` says whether glass is available (`liquidGlass`).

- **Buttons:** `Button` (`variant="glass"` for the one call to action), `PillButton` for secondary actions (label in the action's color, `colors.danger` for deleting; `filled` tints the glass with that color under a white label, for backup and delete buttons), `GlassButton` / `GlassGroup` for round icon buttons. `GlassButton` with `tint` fills with the accent; the save checkmark of `DrawnFormScreenHeader` is one (`prominent`).
- **Choices:** `Chip`, tinted with the accent when chosen. It stays regular glass: made clear, it turned the accent-tinted `StarToggle` next to it blue in the dark scheme.
- **Switches:** `StarToggle` (in `ToggleRow` and the whisper row of `CastSheet`), a round 44 pt glass button with the brand star: clear with an outlined star when off, accent with a white star when on, the star swinging over with a spring.
- **Inputs:** `Field`, `FieldRow` and the chat `Composer` are clear glass, tinted with `accentSoft` while focused: a capsule for one line, a rounded box for several. A multiline `FieldRow` has a set height (`minHeight`, 110 by default) and scrolls inside; with `expandTitle` it only shows the text (it scrolls), and a tap opens it for editing in `/text-editor`, zooming out of the field (`Link.AppleZoom`). A multiline `Field` keeps the hairline box (nothing uses one now).
- **Cards:** `ListCard` (characters, chats, rooms) and the "server not set up" row above the characters are clear glass (`GlassSurface variant="clear"`) with no fill under it; the regular glass over a solid fill looked like a grey haze in the dark scheme. The glass is a sibling of the content, not inside it: a clipped glass loses its rim at the corners.
- **Pressing:** interactive glass springs under the finger by itself, so glass controls add no press scale of their own (the two fight and the control jumps); the scale stays only on the non-glass fallback.
- **Tint changes:** `patches/expo-glass-effect+*.patch` (applied by `patch-package` on `postinstall`) makes a change of `tintColor` on a mounted glass view fade over 0.3 s instead of snapping: UIKit animates only a switch to a new effect object, so the patch builds a fresh `UIGlassEffect` and sets it in `UIView.animate`, after the mount pass. Re-create the patch when updating `expo-glass-effect`.
- **Corners:** glass draws continuous (squircle) corners, so anything that sits on it or clips next to it uses `borderCurve: 'continuous'`.
- **Icons on the accent:** `SFIcon` with `onAccent`. SwiftUI draws a symbol dark in the light scheme even with an explicit white color, so the hosted view gets the dark scheme instead.

## Conventions

- Screens stay thin: data access in `src/db`, logic in `src/lib` or hooks.
- Strings always go through `t('key')`; add the key to both locale files.
- New setting flag: new `src/db/<name>.ts` with `getFlag`/`setFlag`, a row in `(tabs)/settings.tsx`, strings in both locales. To make it findable, wrap the row in `block('<section>', …)`, add the id to `SettingsSection` and an entry to the settings list in `(tabs)/search/index.tsx`.
- New column: append a migration, extend the `*_COLUMNS` constant and the type, and bump `BACKUP_VERSION` in `backup.ts` if the backup should carry it (older backups must still import).
- Check types with `npm run typecheck`.
