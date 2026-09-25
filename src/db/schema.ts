import type { SQLiteDatabase } from 'expo-sqlite'

// Each entry moves the schema up one version; user_version counts how many have run.
const MIGRATIONS = [
  `
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar TEXT,
      system_prompt TEXT NOT NULL DEFAULT '',
      greeting TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.8,
      max_tokens INTEGER NOT NULL DEFAULT 800,
      top_p REAL NOT NULL DEFAULT 0.95,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_character ON messages(character_id, id);
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `,
  // Messages move from characters to chats, so one character can have any number of
  // conversations. The history a character already had becomes its first chat.
  `
    CREATE TABLE chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_chats_character ON chats(character_id);
    INSERT INTO chats (character_id, created_at)
      SELECT character_id, MIN(created_at) FROM messages GROUP BY character_id;

    CREATE TABLE messages_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO messages_v2 (id, chat_id, role, content, created_at)
      SELECT m.id, ch.id, m.role, m.content, m.created_at
      FROM messages m JOIN chats ch ON ch.character_id = m.character_id;
    DROP TABLE messages;
    ALTER TABLE messages_v2 RENAME TO messages;
    CREATE INDEX idx_messages_chat ON messages(chat_id, id);
  `,
  // The picture is kept as base64 JPEG right in the row: the model needs base64 anyway,
  // and in the browser localStorage is too small for photos.
  `
    ALTER TABLE chats ADD COLUMN title TEXT;
    ALTER TABLE messages ADD COLUMN image TEXT;
    ALTER TABLE messages ADD COLUMN image_width INTEGER;
    ALTER TABLE messages ADD COLUMN image_height INTEGER;
  `,
  // Regenerating keeps the earlier replies as variants of the same message. `content`
  // always holds the selected one, so previews and exports keep reading a single column.
  `
    ALTER TABLE messages ADD COLUMN variants TEXT;
    ALTER TABLE messages ADD COLUMN variant INTEGER NOT NULL DEFAULT 0;
  `,
  // What a reasoning model thought before each variant, kept to be unfolded later and
  // never sent back to the model. A JSON array parallel to variants.
  `
    ALTER TABLE messages ADD COLUMN thoughts TEXT;
  `,
  // A per-character cap on reply length, in paragraphs. NULL means no cap; the value
  // never reaches the model and is enforced by truncating the finished reply.
  `
    ALTER TABLE characters ADD COLUMN reply_limit INTEGER;
  `,
  // Whether the character asks the model to think before replying. 'auto' leaves it to
  // the server's own setting (e.g. the LM Studio toggle); 'on'/'off' override it per
  // character via chat_template_kwargs.enable_thinking, which reasoning models honor.
  `
    ALTER TABLE characters ADD COLUMN thinking TEXT NOT NULL DEFAULT 'auto';
  `,
  // A hand-made order for characters and chats, highest first. What was on screen keeps
  // its place (the newest activity on top); a trigger puts every new row above the rest.
  `
    ALTER TABLE characters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE chats ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

    WITH ranked AS (
      SELECT c.id AS id, ROW_NUMBER() OVER (ORDER BY COALESCE(
        (SELECT m.created_at FROM messages m JOIN chats ch ON ch.id = m.chat_id
          WHERE ch.character_id = c.id ORDER BY m.id DESC LIMIT 1), c.created_at), c.id) AS r
      FROM characters c
    )
    UPDATE characters SET sort_order = (SELECT r FROM ranked WHERE ranked.id = characters.id);

    WITH ranked AS (
      SELECT ch.id AS id, ROW_NUMBER() OVER (ORDER BY COALESCE(
        (SELECT m.created_at FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1), ch.created_at), ch.id) AS r
      FROM chats ch
    )
    UPDATE chats SET sort_order = (SELECT r FROM ranked WHERE ranked.id = chats.id);

    CREATE TRIGGER characters_new_on_top AFTER INSERT ON characters BEGIN
      UPDATE characters SET sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM characters) WHERE id = NEW.id;
    END;
    CREATE TRIGGER chats_new_on_top AFTER INSERT ON chats BEGIN
      UPDATE chats SET sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM chats) WHERE id = NEW.id;
    END;
  `,
  // A message can carry several pictures: one JSON array of {base64, width, height} in
  // place of the three columns that held a single one.
  `
    ALTER TABLE messages ADD COLUMN images TEXT;
    UPDATE messages
      SET images = json_array(json_object('base64', image, 'width', image_width, 'height', image_height))
      WHERE image IS NOT NULL;
    ALTER TABLE messages DROP COLUMN image;
    ALTER TABLE messages DROP COLUMN image_width;
    ALTER TABLE messages DROP COLUMN image_height;
  `,
  // A picture behind a character's chats, with how it is softened so the text stays
  // readable: 'blur' or 'dim', and how strongly (0 to 1). The file is kept like an avatar.
  `
    ALTER TABLE characters ADD COLUMN background TEXT;
    ALTER TABLE characters ADD COLUMN background_effect TEXT NOT NULL DEFAULT 'blur';
    ALTER TABLE characters ADD COLUMN background_intensity REAL NOT NULL DEFAULT 0.5;
  `,
  // How see-through the user's message bubbles are over that picture (0 is solid).
  `
    ALTER TABLE characters ADD COLUMN background_bubble_transparency REAL NOT NULL DEFAULT 0.3;
  `,
]

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version])
      await db.execAsync(`PRAGMA user_version = ${version + 1}`)
    })
  }
}
