import type { ChatTurn } from '@/api/llm'
import type { FloorMode, MemberSettings, RoomFields } from '@/db/rooms'
import type { Locale } from '@/i18n'
import { buildEditMessages, languageRule } from '@/lib/chat/promptGen'

// The generators of a room's editor: the scene description, the opening, and the whole room
// set up from a few words ("a party; Kyle and Radan are friends and can't stand Dylan; Elara
// is an introvert"), where the model writes a setup sheet that the editor reads back into
// its fields and each member's numbers.

export type GenCastMember = { name: string; prompt: string }

type Revision = { draft: string; note: string }

// What the model is told of a member: the name and the head of the system prompt, where a
// prompt written as a dossier says who they are and how they behave.
const EXCERPT = 600

function castFacts(cast: GenCastMember[]) {
  if (!cast.length) return 'The room has no characters yet.'
  const lines = cast.map((member) => {
    const about = member.prompt.replace(/\s+/g, ' ').trim()
    const cut = about.length > EXCERPT ? `${about.slice(0, EXCERPT)}…` : about
    return cut ? `- ${member.name}: ${cut}` : `- ${member.name}`
  })
  return ['The cast of the room, with the names exactly as the app knows them:', ...lines].join('\n')
}

function nameKey(name: string) {
  return name.trim().toLowerCase().replace(/ё/g, 'е')
}

export function sameName(a: string, b: string) {
  return nameKey(a) === nameKey(b)
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A name is found as a word of its own with an ending of a few letters at most, so "Дилана"
// finds Дилан. A name too short to have a stem is taken only as it is written, capital and
// all, or "Ли" would turn up in every "ли" and "лишь".
function named(text: string, name: string) {
  const word = name.trim().replace(/ё/g, 'е').replace(/Ё/g, 'Е').split(/\s+/)[0] ?? ''
  const cut = word.replace(/[аеиоуыэюяйьaeiouy]+$/iu, '')
  const pattern = cut.length >= 3 ? `${escape(cut)}\\p{L}{0,3}` : escape(word)
  const flags = cut.length >= 3 ? 'iu' : 'u'
  return word.length > 0 && new RegExp(`(^|[^\\p{L}])${pattern}(?!\\p{L})`, flags).test(text.replace(/ё/g, 'е').replace(/Ё/g, 'Е'))
}

// Characters of the user's list named in the description join the cast, so that "they can't
// stand Dylan" brings Dylan into the room before anyone picked him.
export function castWithNamed(cast: GenCastMember[], library: GenCastMember[], description: string) {
  const extra = library.filter((c) => !cast.some((m) => sameName(m.name, c.name)) && named(description, c.name))
  return [...cast, ...extra]
}

const SCENE_RULES = [
  'The scene description is put into the system prompt of every character of the room as "Scene: ...". Write it as plain facts the model can act on: third person, present tense, short declarative sentences, one fact per line. No metaphors, no piled-up atmosphere, no story of what happens next.',
  'Follow this order, without Markdown or headings:',
  '1. Place and time: where it happens, when, what is around, who else is there in the background.',
  '2. The situation: the occasion, what has just happened, what is at stake.',
  '3. A line "Relationships:" (in the language of the text) and a dash line for each pair or group that matters: who is close, who cannot stand whom and why, who is new here. Call the characters by their names in the cast.',
  '4. A line "Here and now:" (in the language of the text) and a dash line per character on how they act in this scene. Not their whole personality: each has their own prompt for that.',
  'Call the user by their name if it is given, otherwise "the user". Say who the user is to them if the request does, but never decide what the user does, says or feels.',
].join('\n')

const OPENING_RULES = [
  'The opening is the narration a new scene starts with, shown as the narrator\'s line before anyone speaks.',
  'One or two short paragraphs, third person, present tense: the place and the moment, what some of the characters are busy with, and something at the end that invites someone to speak.',
  'The characters act, at most with a short line of speech; it is not a conversation. Never write what the user does, says, thinks or feels.',
  'Plain text: no asterisks, no Markdown, no heading.',
].join('\n')

// The scene description from what the user wants, or the one there is, edited.
export function buildScenarioMessages(
  input: { description: string; cast: GenCastMember[]; base: string | null; locale: Locale },
  revision?: Revision
): ChatTurn[] {
  const context = { facts: castFacts(input.cast), rules: 'Keep the layout of the text and the names of the characters.' }
  if (revision) return buildEditMessages('scenario', revision.draft, revision.note, undefined, context)
  if (input.base !== null) {
    const change = input.description.trim() || 'fill the gaps: the relationships between the characters and how each acts here, as plain lines in the style of the text; keep what is written'
    return buildEditMessages('scenario', input.base, change, undefined, context)
  }
  return [
    {
      role: 'system',
      content: [
        'You write the scene description of a group roleplay room in a chat app, where several AI characters share one scene with the user.',
        SCENE_RULES,
        'Every fact the user gives is fixed: keep it exactly. Fill whatever is left out from what the cast says of the characters.',
        'Aim for about 100-250 words.',
        languageRule(input.locale),
        'Reply with the description only: no preface, no comments after it, no quotes or code fences around it.',
      ].join('\n'),
    },
    { role: 'user', content: `${castFacts(input.cast)}\n\nThe scene: ${input.description.trim() || 'make up a scene that suits this cast.'}` },
  ]
}

// The narration of a scene's start, from the scene description and the cast.
export function buildOpeningMessages(
  input: { scenario: string; cast: GenCastMember[]; wishes: string; locale: Locale },
  revision?: Revision
): ChatTurn[] {
  if (revision) return buildEditMessages('opening', revision.draft, revision.note, undefined, { facts: castFacts(input.cast) })
  return [
    {
      role: 'system',
      content: [
        'You write the opening narration of a group roleplay scene in a chat app, where several AI characters share one scene with the user.',
        OPENING_RULES,
        input.wishes.trim() ? `The user wants the opening to be: ${input.wishes.trim()}` : '',
        languageRule(input.locale),
        'Reply with the narration only.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      role: 'user',
      content: [castFacts(input.cast), input.scenario.trim() ? `The scene:\n${input.scenario.trim()}` : 'The scene is not described: make one up that suits this cast.'].join('\n\n'),
    },
  ]
}

// The setup sheet: the room's settings, its two texts and a block per member, as "Label:
// value" lines. The model writes it, the user can read and change it in the generator, and
// the editor takes it back with parseSetup. The labels follow the app's language; either
// language is read back.
type Key =
  | 'name'
  | 'userName'
  | 'floor'
  | 'maxChain'
  | 'director'
  | 'scenario'
  | 'opening'
  | 'member'
  | 'talkativeness'
  | 'perception'
  | 'triggers'
  | 'muted'
  | 'present'
  | 'secret'
  | 'bonds'
  | 'plot'
  | 'prompt'

const LABELS: Record<Locale, Record<Key, string>> = {
  en: {
    name: 'Name',
    userName: 'Your name',
    floor: 'Who may speak',
    maxChain: 'Lines per turn',
    director: 'Director',
    scenario: 'Scene',
    opening: 'Opening',
    member: 'Member',
    talkativeness: 'Talkativeness',
    perception: 'Perception',
    triggers: 'Triggers',
    muted: 'Only listens',
    present: 'In the scene',
    secret: 'Secret',
    bonds: 'Feelings',
    plot: 'Plot twists',
    prompt: 'New character',
  },
  ru: {
    name: 'Название',
    userName: 'Ваше имя',
    floor: 'Право голоса',
    maxChain: 'Реплик за ход',
    director: 'Режиссёр',
    scenario: 'Сцена',
    opening: 'Вступление',
    member: 'Участник',
    talkativeness: 'Разговорчивость',
    perception: 'Чуткость',
    triggers: 'Триггеры',
    muted: 'Только слушает',
    present: 'В сцене',
    secret: 'Секрет',
    bonds: 'Отношение к другим',
    plot: 'Сюжетные повороты',
    prompt: 'Новый персонаж',
  },
}

// Other names a model might give a label, as the editor calls the field.
const SYNONYMS: Record<string, Key> = {
  'scene description': 'scenario',
  scenario: 'scenario',
  'описание сцены': 'scenario',
  сценарий: 'scenario',
  floor: 'floor',
  'floor mode': 'floor',
  'smart director': 'director',
  'умный режиссёр': 'director',
  character: 'member',
  персонаж: 'member',
  тайна: 'secret',
  feelings: 'bonds',
  'feels about others': 'bonds',
  prompt: 'prompt',
  промпт: 'prompt',
}

const FLOOR_WORDS: Record<Locale, Record<FloorMode, string>> = {
  en: { addressee: 'addressee only', reactions: 'with reactions', open: 'open floor' },
  ru: { addressee: 'только адресат', reactions: 'с реакциями', open: 'свободный микрофон' },
}

const YES_NO: Record<Locale, [string, string]> = { en: ['yes', 'no'], ru: ['да', 'нет'] }

export type SetupMember = { name: string; settings: Omit<MemberSettings, 'characterId'>; prompt?: string }

export type SetupFields = Pick<RoomFields, 'name' | 'userName' | 'floor' | 'maxChain' | 'director' | 'plot' | 'scenario' | 'opening'>

// A member the sheet names but the app does not know comes with `prompt`, the system prompt
// of a character to be made.
export type Setup = {
  fields: Partial<SetupFields>
  members: ({ name: string; prompt?: string } & Partial<Omit<MemberSettings, 'characterId'>>)[]
}

const percent = (value: number) => `${Math.round(value * 100)}%`

export function formatSetup(fields: SetupFields, members: SetupMember[], locale: Locale) {
  const L = LABELS[locale]
  const [yes, no] = YES_NO[locale]
  const flag = (value: boolean) => (value ? yes : no)
  const head = [
    `${L.name}: ${fields.name.trim()}`,
    fields.userName.trim() ? `${L.userName}: ${fields.userName.trim()}` : '',
    `${L.floor}: ${FLOOR_WORDS[locale][fields.floor]}`,
    `${L.maxChain}: ${fields.maxChain}`,
    `${L.director}: ${flag(fields.director)}`,
    `${L.plot}: ${percent(fields.plot)}`,
  ].filter(Boolean)
  // A text of a member stays on its one line; an empty one leaves the label bare.
  const line = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()
  const pad = (text: string) => (text ? ` ${text}` : '')
  const blocks = members.map(({ name, settings, prompt }) =>
    [
      `${L.member}: ${name}`,
      `${L.talkativeness}: ${percent(settings.talkativeness)}`,
      `${L.perception}: ${percent(settings.perception)}`,
      `${L.triggers}:${pad(settings.triggers.trim())}`,
      `${L.muted}: ${flag(settings.muted)}`,
      `${L.present}: ${flag(settings.present)}`,
      `${L.bonds}:${pad(line(settings.bonds))}`,
      `${L.secret}:${pad(line(settings.secret))}`,
      prompt ? `${L.prompt}:\n${prompt.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  )
  return [
    head.join('\n'),
    `${L.scenario}:\n${fields.scenario.trim()}`,
    `${L.opening}:\n${fields.opening.trim()}`,
    ...blocks,
  ].join('\n\n')
}

const KEYS = new Map<string, Key>([
  ...Object.values(LABELS).flatMap((labels) => Object.entries(labels).map(([key, label]) => [nameKey(label), key as Key] as const)),
  ...Object.entries(SYNONYMS).map(([label, key]) => [nameKey(label), key] as const),
])

// A line that starts with a label, Markdown the model put around it (a dash, a heading,
// bold) taken off.
function labelled(line: string): { key: Key; value: string } | null {
  const match = line.match(/^[\s>#*_-]*([^:]{1,40}?)[\s*_]*:[\s*_]*(.*)$/)
  if (!match) return null
  const key = KEYS.get(nameKey(match[1].replace(/[*_]/g, '')))
  return key ? { key, value: match[2].replace(/[*_]+$/, '').trim() } : null
}

function share(value: string) {
  const match = value.match(/\d+(?:[.,]\d+)?/)
  if (!match) return undefined
  let n = Number(match[0].replace(',', '.'))
  if (value.includes('%') || n > 1) n /= 100
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100
}

function flag(value: string) {
  const word = value.trim().toLowerCase()
  if (/^(yes|y|on|true|да|вкл)/.test(word)) return true
  if (/^(no|n|off|false|нет|выкл)/.test(word)) return false
  return undefined
}

function floor(value: string): FloorMode | undefined {
  const word = value.toLowerCase()
  if (/адресат|addressee/.test(word)) return 'addressee'
  if (/реакц|reaction/.test(word)) return 'reactions'
  if (/свобод|микрофон|open/.test(word)) return 'open'
  return undefined
}

const ENDS_TEXT = new Set<Key>(['name', 'floor', 'maxChain', 'director', 'plot', 'scenario', 'opening', 'member'])

export function parseSetup(text: string): Setup {
  const fields: Partial<SetupFields> = {}
  const members: Setup['members'] = []
  // The texts run over the lines under their label, up to the next label: the room's two,
  // and a new character's prompt, which ends its member's block. One left empty keeps what
  // the room has.
  let block: 'scenario' | 'opening' | 'prompt' | null = null
  let lines: string[] = []
  const close = () => {
    const text = lines.join('\n').trim()
    const member = members[members.length - 1]
    if (block === 'prompt') {
      if (member && text) member.prompt = text
    } else if (block && text) fields[block] = text
    block = null
    lines = []
  }
  for (const line of text.split('\n')) {
    const hit = labelled(line)
    // Inside the room's texts only a label of the room or of a member's block ends them: a
    // line of the scene may well begin with "In the scene:" or "Triggers:". A prompt comes
    // last in its block, and any label ends it.
    if (!hit || (block && block !== 'prompt' && !ENDS_TEXT.has(hit.key))) {
      if (block) lines.push(line)
      continue
    }
    close()
    const { key, value } = hit
    const member = members[members.length - 1]
    switch (key) {
      case 'scenario':
      case 'opening':
        block = key
        if (value) lines.push(value)
        break
      case 'prompt':
        if (!member) break
        block = 'prompt'
        if (value) lines.push(value)
        break
      case 'member':
        if (value) members.push({ name: value.replace(/[*_"«»]/g, '').trim() })
        break
      case 'name':
        if (value) fields.name = value
        break
      case 'userName':
        if (value) fields.userName = value
        break
      case 'floor': {
        const mode = floor(value)
        if (mode) fields.floor = mode
        break
      }
      case 'maxChain': {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n)) fields.maxChain = Math.min(5, Math.max(1, n))
        break
      }
      case 'director': {
        const on = flag(value)
        if (on !== undefined) fields.director = on
        break
      }
      case 'plot': {
        const n = share(value)
        if (n !== undefined) fields.plot = n
        break
      }
      case 'secret':
      case 'bonds':
        if (member) member[key] = value
        break
      case 'talkativeness':
      case 'perception': {
        const n = share(value)
        if (member && n !== undefined) member[key] = n
        break
      }
      case 'triggers':
        if (member) member.triggers = value.replace(/[.;]+$/, '').split(/\s*[,;]\s*/).filter(Boolean).join(', ')
        break
      case 'muted':
      case 'present': {
        const on = flag(value)
        if (member && on !== undefined) member[key] = on
        break
      }
    }
  }
  close()
  return { fields, members }
}

// The example the model is shown before the user's request: a cast, a few words about them
// and the sheet they become, in the app's language. A local model keeps a layout it has seen
// far better than one it was only told about. It shows a secret, the feelings, someone who
// comes later and a character the cast lacks.
type ExampleMember = { name: string; talk: number; ear: number; triggers: string; bonds: string; secret?: string; away?: boolean; prompt?: string }

const EXAMPLE: Record<Locale, { cast: GenCastMember[]; description: string; fields: SetupFields; members: ExampleMember[] }> = {
  en: {
    cast: [
      { name: 'Kyle', prompt: 'You are Kyle, a 25-year-old bartender. Loud, sure of himself, the life of every party.' },
      { name: 'Radan', prompt: "You are Radan, Kyle's best friend since school. A programmer with a sharp tongue." },
      { name: 'Dylan', prompt: 'You are Dylan, new to the group. You try hard to be liked.' },
      { name: 'Mike', prompt: 'You are Mike, a good-natured neighbor who loves to chat.' },
      { name: 'Lucas', prompt: "You are Lucas, Mike's coworker. Calm and thorough." },
      { name: 'Elara', prompt: 'You are Elara, an art student. Quiet and observant.' },
    ],
    description:
      "We're having a party. Kyle and Radan are friends and can't stand Dylan. Mike and Lucas love talking about the weather. Elara is an introvert. Dylan is secretly dating Radan's ex. Later on Vera from next door drops by.",
    fields: {
      name: "Party at Kyle's",
      userName: '',
      floor: 'open',
      maxChain: 3,
      director: true,
      plot: 0.3,
      scenario: [
        "Saturday night, a party at Kyle's flat. Loud music, a crowded kitchen, a balcony for smokers, about fifteen guests.",
        'Kyle is celebrating a new job. The user is one of the guests.',
        'Relationships:',
        '- Kyle and Radan have been friends since school; they stick together and back each other up.',
        "- Kyle and Radan can't stand Dylan and don't hide it. Dylan pretends not to notice.",
        '- Mike and Lucas get along easily and start talking about the weather at every pause.',
        '- Elara hardly knows anyone here.',
        '- Vera lives next door and knows everyone a little.',
        'Here and now:',
        '- Kyle is the host: loud, always on the move, keeps an eye on Dylan.',
        '- Radan makes digs at Dylan.',
        '- Dylan tries to make friends with everyone else.',
        '- Elara stays by the window, answers in a few words and warms up only one on one.',
      ].join('\n'),
      opening:
        "The music in Kyle's flat is loud enough to rattle the glasses on the shelf. The kitchen is packed: Mike and Lucas are arguing about whether it will rain tomorrow, and Radan whispers something to Kyle, nodding at Dylan, who has just walked in with a bottle of wine. Elara stands by the window with an untouched drink, watching the drops crawl down the glass.",
    },
    members: [
      { name: 'Kyle', talk: 0.8, ear: 0.3, triggers: 'Dylan, party, music, Radan', bonds: "Would do anything for Radan. Can't stand Dylan and wants him gone." },
      { name: 'Radan', talk: 0.65, ear: 0.35, triggers: 'Dylan, Kyle, code, ex', bonds: 'Trusts Kyle completely. Despises Dylan without quite knowing why.' },
      {
        name: 'Dylan',
        talk: 0.55,
        ear: 0.45,
        triggers: 'Kyle, Radan, wine',
        bonds: 'Afraid of Radan, wants Kyle to like him, finds Elara easy to talk to.',
        secret: "He is dating Radan's ex and dreads the day Radan finds out.",
      },
      { name: 'Mike', talk: 0.7, ear: 0.15, triggers: 'weather, rain, forecast, Lucas', bonds: 'Likes everyone, Lucas most of all.' },
      { name: 'Lucas', talk: 0.5, ear: 0.15, triggers: 'weather, rain, Mike', bonds: 'Gets on with Mike; keeps out of the others\' quarrels.' },
      { name: 'Elara', talk: 0.15, ear: 0.6, triggers: 'drawing, art, window, quiet', bonds: 'Wary of the loud ones; Dylan seems kind to her.' },
      {
        name: 'Vera',
        talk: 0.6,
        ear: 0.5,
        triggers: 'music, noise, Kyle, gossip',
        bonds: 'Fond of Kyle like a younger brother; curious about the newcomers.',
        away: true,
        prompt:
          'You are Vera, 34, Kyle\'s neighbor from across the landing. A nurse on night shifts.\nShort, curly red hair, always in an old cardigan.\nDirect, warm, nosy; you know all the gossip of the building and share it gladly.\nYou speak fast, with a dry laugh, and call everyone "sweetheart".\nYou came to complain about the noise and stayed.',
      },
    ],
  },
  ru: {
    cast: [
      { name: 'Кайл', prompt: 'Ты Кайл, 25 лет, бармен. Шумный, самоуверенный, душа любой вечеринки.' },
      { name: 'Радан', prompt: 'Ты Радан, лучший друг Кайла со школы. Программист с острым языком.' },
      { name: 'Дилан', prompt: 'Ты Дилан, новенький в компании. Очень стараешься понравиться.' },
      { name: 'Майк', prompt: 'Ты Майк, добродушный сосед, любишь поговорить.' },
      { name: 'Лукас', prompt: 'Ты Лукас, коллега Майка. Спокойный и обстоятельный.' },
      { name: 'Элиара', prompt: 'Ты Элиара, студентка-художница. Тихая и наблюдательная.' },
    ],
    description:
      'У нас вечеринка. Кайл и Радан друзья, не терпят Дилана. Майк и Лукас любят болтать о погоде. Элиара вообще интроверт. Дилан тайно встречается с бывшей Радана. Ближе к ночи заглянет соседка Вера.',
    fields: {
      name: 'Вечеринка у Кайла',
      userName: '',
      floor: 'open',
      maxChain: 3,
      director: true,
      plot: 0.3,
      scenario: [
        'Субботний вечер, вечеринка в квартире Кайла. Громкая музыка, тесная кухня, балкон для курящих, человек пятнадцать гостей.',
        'Кайл отмечает новую работу. Пользователь — один из гостей.',
        'Отношения:',
        '- Кайл и Радан дружат со школы, держатся вместе и всегда друг друга поддерживают.',
        '- Кайл и Радан не терпят Дилана и не скрывают этого. Дилан делает вид, что не замечает.',
        '- Майк и Лукас легко находят общий язык и при любой паузе заводят разговор о погоде.',
        '- Элиара почти никого здесь не знает.',
        '- Вера живёт за стенкой и всех понемногу знает.',
        'Здесь и сейчас:',
        '- Кайл — хозяин: громкий, всё время в движении, присматривает за Диланом.',
        '- Радан отпускает колкости в адрес Дилана.',
        '- Дилан старается подружиться со всеми остальными.',
        '- Элиара держится у окна, отвечает коротко и оттаивает только наедине.',
      ].join('\n'),
      opening:
        'Музыка в квартире Кайла такая громкая, что звенят бокалы на полке. На кухне не протолкнуться: Майк с Лукасом спорят, пойдёт ли завтра дождь, а Радан что-то шепчет Кайлу, кивая на Дилана, который только что вошёл с бутылкой вина. Элиара стоит у окна с нетронутым стаканом и смотрит, как по стеклу ползут капли.',
    },
    members: [
      { name: 'Кайл', talk: 0.8, ear: 0.3, triggers: 'Дилан, вечеринка, музыка, Радан', bonds: 'За Радана горой. Дилана терпеть не может и ждёт, когда тот уйдёт.' },
      { name: 'Радан', talk: 0.65, ear: 0.35, triggers: 'Дилан, Кайл, код, бывшая', bonds: 'Доверяет Кайлу во всём. Презирает Дилана, сам толком не зная за что.' },
      {
        name: 'Дилан',
        talk: 0.55,
        ear: 0.45,
        triggers: 'Кайл, Радан, вино',
        bonds: 'Боится Радана, хочет понравиться Кайлу, с Элиарой ему легко.',
        secret: 'Встречается с бывшей девушкой Радана и до ужаса боится, что тот узнает.',
      },
      { name: 'Майк', talk: 0.7, ear: 0.15, triggers: 'погода, дождь, прогноз, Лукас', bonds: 'Любит всех, а Лукаса больше всех.' },
      { name: 'Лукас', talk: 0.5, ear: 0.15, triggers: 'погода, дождь, Майк', bonds: 'Ладит с Майком, в чужие ссоры не лезет.' },
      { name: 'Элиара', talk: 0.15, ear: 0.6, triggers: 'рисунок, искусство, окно, тишина', bonds: 'Сторонится шумных; Дилан кажется ей добрым.' },
      {
        name: 'Вера',
        talk: 0.6,
        ear: 0.5,
        triggers: 'музыка, шум, Кайл, сплетни',
        bonds: 'Любит Кайла как младшего брата; к новеньким присматривается с любопытством.',
        away: true,
        prompt:
          'Ты Вера, 34 года, соседка Кайла по площадке. Медсестра, работаешь в ночные смены.\nНевысокая, рыжие кудри, вечно в старом кардигане.\nПрямая, тёплая, любопытная; знаешь все сплетни дома и охотно ими делишься.\nГоворишь быстро, с сухим смешком, всех зовёшь «солнце».\nПришла ругаться из-за шума и осталась.',
      },
    ],
  },
}

// The words of the example, which the generator also offers the user as a sample of how to
// describe a room.
export function setupExample(locale: Locale) {
  return EXAMPLE[locale].description
}

function exampleSheet(locale: Locale) {
  const example = EXAMPLE[locale]
  const members = example.members.map((m) => ({
    name: m.name,
    settings: { talkativeness: m.talk, perception: m.ear, triggers: m.triggers, muted: false, present: !m.away, secret: m.secret ?? '', bonds: m.bonds },
    prompt: m.prompt,
  }))
  return formatSetup(example.fields, members, locale)
}

function setupRules(locale: Locale) {
  const L = LABELS[locale]
  const F = FLOOR_WORDS[locale]
  const [yes, no] = YES_NO[locale]
  return [
    "You set up a group roleplay room in a chat app from the user's description. Several AI characters share one scene with the user; the app decides who speaks next by the numbers you set.",
    'Reply with a setup sheet in exactly the layout of the example: the same labels, each at the start of its own line and followed by a colon, in the same order, a blank line between the parts. No Markdown, no comments, nothing before or after the sheet.',
    "Keep the labels and the yes/no words as they are in the example; write the texts and the triggers in the language of the user's description.",
    'What each line means:',
    `- ${L.name}: a short title for the room.`,
    `- ${L.userName}: only if the description says what the characters call the user; otherwise leave the line out.`,
    `- ${L.floor}: who may speak after the one addressed has answered. "${F.open}" when several people talk freely and cut in (a party, a quarrel, a debate); "${F.reactions}" when one leads and the others comment; "${F.addressee}" for questioning one by one or a quiet scene.`,
    `- ${L.maxChain}: 1 to 5, how many characters may speak in a row before it is the user's turn. Usually 2 or 3, 4 or 5 for a lively crowd.`,
    `- ${L.director}: ${yes} lets the model pick the speaker when it is unclear, lets the characters come and go by themselves and keeps their feelings up to date as the story goes. Keep ${yes} unless the user asks otherwise.`,
    `- ${L.plot}: 0-100%, how often the narrator brings in an event when the talk stalls (someone arrives, news, a twist). 0% for a quiet scene the user wants to steer alone; 20-40% usually; 60-100% for an adventure or a drama. Works only with the director on.`,
    `- ${L.scenario}: the scene description, on the lines under the label.`,
    SCENE_RULES,
    `- ${L.opening}: the narration each new scene starts with, on the lines under the label.`,
    OPENING_RULES,
    `- ${L.member}: a block for every character of the cast, in the order of the cast, the name exactly as in the cast.`,
    `- ${L.talkativeness}: 0-100%, how eager they are to speak up. Hosts, loudmouths, the sociable: 65-90%. Most people: 40-60%. The shy, the gloomy, introverts: 5-25%.`,
    `- ${L.perception}: 0-100%, the chance to overhear a whisper meant for someone else. 15% by default; the attentive, the nosy, the suspicious: 40-80%; the distracted, the drunk, the absorbed: 0-10%.`,
    `- ${L.triggers}: 2 to 6 topics, comma-separated, that make them want to cut in: the names of people they love or hate, their passions, their sore spots. Short words as they would be said in the chat: the app looks for them in every line.`,
    `- ${L.muted}: ${yes} only for someone the description says keeps silent unless asked; otherwise ${no}.`,
    `- ${L.present}: ${no} for someone who comes later or is away at the start; otherwise ${yes}.`,
    `- ${L.bonds}: one or two short sentences on how they feel about the others right now, by name. The director keeps it up as the story goes.`,
    `- ${L.secret}: what only this character knows and the others do not (a debt, a crush, a plan, a lie). Only if the description gives one or the scene clearly calls for it; otherwise leave it empty. The others never see it.`,
    `- ${L.prompt}: only for someone the description names who must be in the scene but is not in the cast. Give them a block like everyone else and end it with this label, their system prompt on the lines under it: second person ("You are <name>, ..."), 60-150 words of plain facts, one per line: who they are, age, appearance, character, how they speak, what brings them here. The app creates the character. Never add anyone the description does not name.`,
    'Every relationship and trait the user gives is fixed: put it into the scene description and into the numbers and the triggers. Fill whatever is left out from what the cast says of the characters.',
  ].join('\n')
}

// The room from the user's words, or the sheet of the room as it is, edited. The example
// goes first as a request and its answer, so the model has seen the layout done once.
export function buildSetupMessages(
  input: { description: string; cast: GenCastMember[]; base: string | null; locale: Locale },
  revision?: Revision
): ChatTurn[] {
  const rules = setupRules(input.locale)
  const context = {
    facts: castFacts(input.cast),
    rules: `It is a setup sheet whose layout the app reads back, so keep every label as it is. Every character of the cast has a block: add one for any that lacks it. A block with "${LABELS[input.locale].prompt}" is a character the app has not made yet: keep its prompt.\n${rules}`,
  }
  if (revision) return buildEditMessages('room', revision.draft, revision.note, undefined, context)
  if (input.base !== null) {
    const change =
      input.description.trim() ||
      'fill in what is missing: the relationships and the scene, an opening, triggers and feelings for everyone, and the numbers to fit each character; keep what is written'
    return buildEditMessages('room', input.base, change, undefined, context)
  }
  const example = EXAMPLE[input.locale]
  const request = (cast: GenCastMember[], description: string) => `${castFacts(cast)}\n\nThe description: ${description}`
  return [
    { role: 'system', content: [rules, languageRule(input.locale)].join('\n') },
    { role: 'user', content: request(example.cast, example.description) },
    { role: 'assistant', content: exampleSheet(input.locale) },
    {
      role: 'user',
      content: request(input.cast, input.description.trim() || 'make up a scene that suits this cast.'),
    },
  ]
}
