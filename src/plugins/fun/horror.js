/**
 * horror.js — interactive paranormal case files.
 *
 * Usage:
 *   .horror                 list cases and show controls
 *   .horror start <number>  start or restart a case in this chat
 *   .horror 1               shorthand for starting case 1
 *   .horror choose <A|B|C> choose the current action
 *   .horror status          show sanity, clues, and current case
 *   .horror stop            abandon the current investigation
 *
 * Progress is shared by the current chat and persisted in the main database,
 * so a group can investigate together and resume after a restart.
 */
import { db } from '../../database/db.js';

const CASES = [
  {
    id: 1,
    title: 'The House That Texted Back',
    icon: '🏚️',
    hook: 'At 2:13 a.m., an abandoned house sends your group a message from a number that does not exist.',
    scenes: [
      {
        text: 'The message contains one line: “I can see the room you are in.” A second message arrives with a photo of the house. One upstairs window is lit.',
        choices: [
          { key: 'A', label: 'Reply: WHO ARE YOU?', text: 'The typing bubble appears instantly. “The person standing behind you.” Nobody is there — but the room temperature drops.', sanity: -10, clue: 1, next: 1 },
          { key: 'B', label: 'Call the number', text: 'The call connects. You hear your own group chat echoing back several seconds before anyone speaks.', sanity: -5, clue: 1, next: 1 },
          { key: 'C', label: 'Ignore it and lock the doors', text: 'The house sends one final message: “Good. Stay exactly where you are.” Your front door clicks open by itself.', sanity: -15, next: 1 },
        ],
      },
      {
        text: 'You reach the house. The front door is open, and wet footprints lead upstairs. They stop outside a room marked with your group name.',
        choices: [
          { key: 'A', label: 'Follow the footprints', text: 'Inside the room is a phone displaying a live video of your group from the hallway below. The video is dated tomorrow.', sanity: -15, clue: 1, next: 2 },
          { key: 'B', label: 'Search the hallway', text: 'You find a wall covered in names. The newest name is the person who just read this message.', sanity: -20, clue: 1, next: 2 },
          { key: 'C', label: 'Leave immediately', text: 'The exit is gone. Every door opens into the same upstairs room. Something knocks from inside the phone.', sanity: -25, next: 2 },
        ],
      },
      {
        text: 'The phone screen shows a final prompt: “Choose who stays behind.” The house goes silent, waiting for a name.',
        choices: [
          { key: 'A', label: 'Destroy the phone', text: 'The screen cracks. In the darkness, the house whispers your group’s first message back to you — but from inside the walls.', sanity: -30, ending: 'escape' },
          { key: 'B', label: 'Answer the prompt', text: 'The phone displays: “Thank you for volunteering.” The upstairs window goes dark, and one seat in your group chat becomes permanently silent.', sanity: -40, ending: 'taken' },
          { key: 'C', label: 'Send the photo back', text: 'The image reverses. The lit window is not upstairs — it is the reflection in the phone screen. You have been outside the house the whole time.', clue: 1, ending: 'truth' },
        ],
      },
    ],
  },
  {
    id: 2,
    title: 'Last Train to Black Hollow',
    icon: '🚆',
    hook: 'A train appears on a timetable that was removed from the station thirty years ago. It arrives at midnight.',
    scenes: [
      {
        text: 'Platform 4 is empty except for a conductor with no reflection. He asks for your ticket. Nobody remembers buying one.',
        choices: [
          { key: 'A', label: 'Show your phone', text: 'Your lock screen has changed to a ticket dated 1978. The conductor smiles and stamps it with a cold thumb.', sanity: -10, clue: 1, next: 1 },
          { key: 'B', label: 'Ask where the train goes', text: 'He points down the tunnel. “Where all unfinished journeys go.” The rails begin to hum.', sanity: -5, clue: 1, next: 1 },
          { key: 'C', label: 'Run from the platform', text: 'The station exit leads back to Platform 4. The clock now reads 11:59, no matter how long you run.', sanity: -15, next: 1 },
        ],
      },
      {
        text: 'Inside the train, every seat is occupied by a silent passenger holding a different lost object: a key, a shoe, a wedding ring, a child’s drawing.',
        choices: [
          { key: 'A', label: 'Take the empty seat', text: 'The passenger beside you turns. They have your face, but older. They point to the window and mouth: “Not yet.”', sanity: -10, clue: 1, next: 2 },
          { key: 'B', label: 'Inspect the lost objects', text: 'One object belongs to someone in your group. It is warm, as if it was dropped only seconds ago.', sanity: -15, clue: 1, next: 2 },
          { key: 'C', label: 'Pull the emergency brake', text: 'The train stops between stations. Every passenger turns toward you at once. The conductor begins walking down the aisle.', sanity: -25, next: 2 },
        ],
      },
      {
        text: 'The conductor reaches your carriage. Behind him, the tunnel is filled with hundreds of tiny lights — like windows in a buried city.',
        choices: [
          { key: 'A', label: 'Give back the lost object', text: 'The passengers vanish one by one. The train doors open onto your real station at 12:01. You step out alone, carrying one extra shadow.', clue: 1, ending: 'escape' },
          { key: 'B', label: 'Ask for the final stop', text: 'The conductor removes his cap. Beneath it is a second face. “You arrived years ago,” he says.', sanity: -40, ending: 'taken' },
          { key: 'C', label: 'Jump from the train', text: 'You land on a platform covered in old timetables. One of them lists tonight’s date — and your name as the destination.', sanity: -25, clue: 1, ending: 'truth' },
        ],
      },
    ],
  },
  {
    id: 3,
    title: 'The Voice Behind the Wall',
    icon: '🧱',
    hook: 'Every night, a voice behind the apartment wall asks the same question: “Are you awake?” Tonight, it says your name.',
    scenes: [
      {
        text: 'The voice repeats your name in the exact voice of the person reading this command. The wall is cold, but something is breathing on the other side.',
        choices: [
          { key: 'A', label: 'Knock three times', text: 'Three knocks answer from inside the wall before your hand touches it again. Then a fourth knock comes from behind your group.', sanity: -10, clue: 1, next: 1 },
          { key: 'B', label: 'Ask what it wants', text: 'The voice says, “A way out.” It gives you an address — your own address, written backward.', sanity: -5, clue: 1, next: 1 },
          { key: 'C', label: 'Play loud music', text: 'The music stops. The voice continues singing the next line before the song reaches it.', sanity: -15, next: 1 },
        ],
      },
      {
        text: 'A hairline crack has appeared in the wall. Through it you can see a hallway that looks exactly like yours, except every door is open.',
        choices: [
          { key: 'A', label: 'Widen the crack', text: 'A hand reaches through and drops a key. Its tag reads: “YOUR ROOM — OTHER SIDE.”', sanity: -20, clue: 1, next: 2 },
          { key: 'B', label: 'Seal the crack', text: 'The wall becomes warm. The voice starts counting down from ten, but skips the number seven.', sanity: -15, next: 2 },
          { key: 'C', label: 'Look through the crack', text: 'You see your group standing in the other hallway, staring back. One of them waves before anyone here does.', sanity: -25, clue: 1, next: 2 },
        ],
      },
      {
        text: 'The voice whispers: “One of us is on the wrong side.” The lights go out. You have one action before the wall opens.',
        choices: [
          { key: 'A', label: 'Use the key', text: 'The key opens the front door, not the wall. Outside is daylight. You escape — but the sun is on the wrong side of the sky.', clue: 1, ending: 'truth' },
          { key: 'B', label: 'Call everyone’s name', text: 'Every person answers except one. The missing voice answers from behind the wall: “I am already here.”', sanity: -40, ending: 'taken' },
          { key: 'C', label: 'Stay silent', text: 'The wall closes. The voice fades. On the other side, something begins knocking softly — in the rhythm of your heartbeat.', sanity: -20, ending: 'escape' },
        ],
      },
    ],
  },
];

const REAL_CASES = [
  {
    id: 1,
    title: 'Villisca, Iowa — The Unsolved Night',
    icon: '🕯️',
    hook: 'On June 9, 1912, eight people were killed inside a Villisca home after a children’s church program. The killer was never conclusively identified.',
    source: 'https://murderhouse.com/the-house-and-murders/the-murders/',
    sourceLabel: 'Villisca Axe Murder House — historical account',
    conclusion: 'The documented record ends without a conclusive identification of the killer. This case file is a reconstruction of the unanswered questions, not a claim that the choices changed history.',
    scenes: [
      {
        text: 'The Moore family and the Stillinger sisters returned home after the church program. The next morning, the house was found locked and silent.',
        choices: [
          { key: 'A', label: 'Build the last-known timeline', text: 'You mark the church program, the walk home, and the last confirmed sighting. A timeline narrows the window, but it cannot name a suspect.', clue: 1, next: 1 },
          { key: 'B', label: 'Start with the locked door', text: 'The lock suggests the killer may have used a house key, but the record does not establish who locked it or when.', clue: 1, next: 1 },
          { key: 'C', label: 'Follow the local rumors', text: 'Rumor multiplies faster than evidence. You separate witness statements from later speculation and keep only the dated material.', sanity: -5, next: 1 },
        ],
      },
      {
        text: 'The scene contained details that later investigators and historians still debate. Early evidence collection was limited by the standards of the time.',
        choices: [
          { key: 'A', label: 'Separate record from legend', text: 'You flag the covered mirrors, the axe, and the locked house as reported scene details — not proof of motive or identity.', clue: 1, next: 2 },
          { key: 'B', label: 'Name a suspect immediately', text: 'The shortcut feels satisfying, but it turns an unsolved case into a story with false certainty. You discard the guess.', sanity: -5, next: 2 },
          { key: 'C', label: 'Compare later confessions', text: 'Several people were accused or confessed over the years. None produced a conclusive resolution accepted by the record.', clue: 1, next: 2 },
        ],
      },
      {
        text: 'The final question is not “who looks frightening?” It is whether the surviving evidence can support an answer after more than a century.',
        choices: [
          { key: 'A', label: 'Close the file as unsolved', text: 'You resist inventing an ending. The responsible conclusion is uncertainty.', clue: 1, ending: 'real' },
          { key: 'B', label: 'Publish the strongest rumor', text: 'The rumor spreads, but repetition is not corroboration. The file remains unresolved.', ending: 'real' },
          { key: 'C', label: 'Preserve every source note', text: 'You leave a clean record for the next investigator: dates, testimony, scene details, and the gaps between them.', clue: 1, ending: 'real' },
        ],
      },
    ],
  },
  {
    id: 2,
    title: 'Fayetteville, West Virginia — The Sodder Children',
    icon: '🔥',
    hook: 'On Christmas Eve 1945, a fire destroyed the Sodder home. Five children were never seen again, and the family spent decades questioning what happened.',
    source: 'https://www.wusf.org/2005-12-23/mystery-of-missing-children-haunts-w-va-town',
    sourceLabel: 'NPR report republished by WUSF — “Mystery of Missing Children Haunts W.Va. Town”',
    conclusion: 'The case remains surrounded by conflicting memories, rumors, and missing evidence. Fire professionals cited in the report believed the children likely died in the blaze, while the family continued to believe they may have been taken.',
    scenes: [
      {
        text: 'The fire began after the family went to sleep. Four children and the parents escaped; five children, ages 5, 8, 9, 12, and 14, were never seen again.',
        choices: [
          { key: 'A', label: 'Map the emergency timeline', text: 'You record the alarm, the attempted rescue, and the delayed fire response. The delay becomes part of the mystery, but it does not prove a cause.', clue: 1, next: 1 },
          { key: 'B', label: 'Treat every rumor as evidence', text: 'The file fills with sightings and theories. You mark them as unverified until they can be independently supported.', sanity: -5, next: 1 },
          { key: 'C', label: 'Review the physical evidence', text: 'The report describes a brief search and disputed remains. The lack of a complete recovery left the family without certainty.', clue: 1, next: 1 },
        ],
      },
      {
        text: 'The family later investigated possible sightings and received reports from across the country. None definitively located the children.',
        choices: [
          { key: 'A', label: 'Follow the strongest sighting', text: 'A photograph and a claimed resemblance create hope, but resemblance alone cannot establish identity.', clue: 1, next: 2 },
          { key: 'B', label: 'Ask what is actually known', text: 'You return to the reliable core: the fire, the missing children, the incomplete evidence, and decades of uncertainty.', clue: 1, next: 2 },
          { key: 'C', label: 'Choose the most dramatic theory', text: 'A dramatic theory is memorable, but the source explicitly warns that misinformation and rumor grew around the tragedy.', sanity: -5, next: 2 },
        ],
      },
      {
        text: 'The case is painful precisely because the surviving record cannot close the gap between a family’s hope and the evidence available.',
        choices: [
          { key: 'A', label: 'Record uncertainty honestly', text: 'You leave the case open without turning grief into a supernatural explanation.', clue: 1, ending: 'real' },
          { key: 'B', label: 'Declare a kidnapping as fact', text: 'The theory remains possible to some people, but the available record does not establish it as fact.', ending: 'real' },
          { key: 'C', label: 'Declare the fire solved', text: 'A likely explanation is not the same as a fully documented answer. The responsible file keeps both the evidence and the uncertainty.', clue: 1, ending: 'real' },
        ],
      },
    ],
  },
  {
    id: 3,
    title: 'Westfield, New Jersey — The Watcher Letters',
    icon: '✉️',
    hook: 'After a family bought a home in Westfield in 2014, letters from an unidentified writer calling themselves “The Watcher” reportedly drove them away from the house.',
    source: 'https://abcnews.com/US/alleged-stalker-watcher-sends-letter-specific-threats-nj/story?id=46480325',
    sourceLabel: 'ABC News — court documents and police investigation reported in 2017',
    conclusion: 'The documented account describes threatening letters, lawsuits, a public appeal for information, and an investigation that had not produced charges at the time of the report. The writer’s identity was not established in that source.',
    scenes: [
      {
        text: 'The first letters claimed a long connection to the house and referred to watching the family. The family did not move into the home.',
        choices: [
          { key: 'A', label: 'Preserve the letters', text: 'You treat the envelopes, dates, wording, and delivery pattern as evidence instead of turning the writer into a supernatural character.', clue: 1, next: 1 },
          { key: 'B', label: 'Search for a hidden ghost story', text: 'The reported case concerns an unidentified human harasser. The supernatural explanation is not supported by the source.', sanity: -5, next: 1 },
          { key: 'C', label: 'Ask who had access', text: 'You focus on the practical question: who could know the house, its residents, and the family’s movements?', clue: 1, next: 1 },
        ],
      },
      {
        text: 'According to the report, a later letter arrived after a long silence. The family, a renter, previous owners, and the town became part of legal and public disputes.',
        choices: [
          { key: 'A', label: 'Keep allegations separate', text: 'You label claims as claims. A lawsuit, a letter, and a police lead are different kinds of evidence.', clue: 1, next: 2 },
          { key: 'B', label: 'Publish a suspect’s name', text: 'Naming an uncharged person would turn fear into a new harm. You remove the speculation from the case file.', sanity: -5, next: 2 },
          { key: 'C', label: 'Review the official response', text: 'The report says police investigated and the mayor asked for public help, but no suspect had been charged at that point.', clue: 1, next: 2 },
        ],
      },
      {
        text: 'The most frightening detail is also the most ordinary: someone may have been using private knowledge to make a family feel watched in its own home.',
        choices: [
          { key: 'A', label: 'Close the file without a suspect', text: 'You preserve the facts and refuse to turn an unresolved harassment case into a solved story.', clue: 1, ending: 'real' },
          { key: 'B', label: 'Assume the nearest neighbor did it', text: 'Proximity is not proof. The source did not establish the writer’s identity.', ending: 'real' },
          { key: 'C', label: 'Document the pattern', text: 'Dates, access, wording, and corroboration become the responsible next steps — not a viral accusation.', clue: 1, ending: 'real' },
        ],
      },
    ],
  },
];

const ENDINGS = {
  escape: {
    title: 'YOU ESCAPED — PROBABLY',
    text: 'The investigation ends, but nobody agrees on what happened. Check the chat tomorrow. There may be one message you do not remember sending.',
  },
  truth: {
    title: 'THE TRUTH FOUND YOU',
    text: 'You uncovered the pattern. The haunting was never attached to the place — it was attached to the people who noticed it.',
  },
  taken: {
    title: 'SOMETHING CAME BACK WITH YOU',
    text: 'The case is closed. The chat is still active. But one reply is arriving a few seconds before anyone sends a message.',
  },
};

function gamesStore() {
  if (!db.data.horrorGames || typeof db.data.horrorGames !== 'object') db.data.horrorGames = {};
  return db.data.horrorGames;
}

function saveGames(games) {
  db.set('horrorGames', games);
}

function getGame(jid) {
  return gamesStore()[jid] || null;
}

function optionText(choice) {
  return `${choice.key}. ${choice.label}`;
}

function renderCaseList(prefix, mode = 'fiction') {
  const isReal = mode === 'real';
  const cases = isReal ? REAL_CASES : CASES;
  return [
    isReal ? '📚 *REAL-LIFE U.S. CASE FILES*' : '🕯️ *FICTIONAL HAUNTED CASE FILES*',
    isReal ? '_Documented cases, retold without graphic detail. Facts and uncertainty are kept separate._' : '_Original supernatural fiction._',
    '',
    ...cases.map((item) => `${item.icon} *${item.id}. ${item.title}*\n_${item.hook}_`),
    '',
    isReal
      ? `Start one with *${prefix}horror real start 1*`
      : `Start one with *${prefix}horror start 1*`,
    'The investigation is shared by this chat — choose together.',
  ].join('\n');
}

function renderScene(game, story) {
  const scene = story.scenes[game.step];
  const status = `🧠 Sanity: ${Math.max(0, game.sanity)}%  •  🔎 Clues: ${game.clues}`;
  return [
    `${story.icon} *${story.title}*`,
    '',
    scene.text,
    '',
    ...scene.choices.map(optionText),
    '',
    status,
    `_Choose with ${game.prefix || '.'}horror choose A, or use ${game.prefix || '.'}horror A._`,
  ].join('\n');
}

function parseChoice(args) {
  const raw = (args[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw === '1' || raw === 'A') return 'A';
  if (raw === '2' || raw === 'B') return 'B';
  if (raw === '3' || raw === 'C') return 'C';
  return null;
}

export default {
  name: 'horror',
  aliases: ['scary', 'haunt', 'casefile'],
  category: 'fun',
  description: 'Play fictional or real-life U.S. horror case files. Usage: .horror real start 1',
  cooldown: 1500,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const games = gamesStore();
    const jid = m.from;
    const action = (args[0] || '').toLowerCase();

    if (!args.length) {
      return m.reply(`${renderCaseList(p, 'fiction')}\n\n${renderCaseList(p, 'real')}`);
    }
    if (['help', 'cases', 'list'].includes(action)) {
      return m.reply(`${renderCaseList(p, 'fiction')}\n\n${renderCaseList(p, 'real')}`);
    }

    if (action === 'stop' || action === 'quit' || action === 'leave') {
      if (!games[jid]) return m.reply.info('There is no active investigation in this chat.', '🕯️ CASE FILES');
      delete games[jid];
      saveGames(games);
      return m.reply('🕯️ Investigation abandoned. The case file has been sealed.');
    }

    const game = getGame(jid);
    if (action === 'status') {
      if (!game) return m.reply.info(`No active case. Start one with *${p}horror start 1*.`, '🕯️ CASE FILES');
      const story = (game.mode === 'real' ? REAL_CASES : CASES).find((item) => item.id === game.caseId);
      return m.reply(`${story.icon} *${story.title}*\n\nMode: ${game.mode === 'real' ? 'Real-life U.S. case' : 'Fictional paranormal'}\n🧠 Sanity: ${Math.max(0, game.sanity)}%\n🔎 Clues: ${game.clues}\n📍 Scene: ${game.step + 1}/${story.scenes.length}\n👥 Investigators: ${game.players.length || 1}`);
    }

    let selectedMode = 'fiction';
    let caseNumber = null;
    if (['real', 'reallife', 'true', 'documented', 'realistic'].includes(action)) {
      selectedMode = 'real';
      const realAction = (args[1] || '').toLowerCase();
      if (!realAction) return m.reply(renderCaseList(p, 'real'));
      if (['start', 'new', 'begin'].includes(realAction)) caseNumber = Number.parseInt(args[2], 10);
      else if (/^\d+$/.test(realAction)) caseNumber = Number.parseInt(realAction, 10);
    } else if (action === 'start' || action === 'new' || action === 'begin') {
      caseNumber = Number.parseInt(args[1], 10);
    } else if (/^\d+$/.test(action)) {
      caseNumber = Number.parseInt(action, 10);
    }

    if (caseNumber !== null && Number.isInteger(caseNumber)) {
      const caseList = selectedMode === 'real' ? REAL_CASES : CASES;
      const story = caseList.find((item) => item.id === caseNumber);
      if (!story) return m.reply.error(`Choose a case from 1 to ${caseList.length}. Use *${p}horror ${selectedMode === 'real' ? 'real' : ''}* to see the files.`);
      const nextGame = {
        caseId: story.id,
        mode: selectedMode,
        step: 0,
        sanity: 100,
        clues: 0,
        players: [m.sender],
        startedAt: Date.now(),
        prefix: p,
      };
      games[jid] = nextGame;
      saveGames(games);
      return m.reply(`${story.icon} *CASE OPENED: ${story.title}*\n\n${story.hook}\n\n${renderScene(nextGame, story)}`);
    }

    if (!game) {
      return m.reply(`${renderCaseList(p, 'fiction')}\n\n${renderCaseList(p, 'real')}\n\n_Choose a case to start an investigation._`);
    }

    if (game.ended) {
      return m.reply(`This case is already closed: *${game.endingTitle}*\n\nStart another with *${p}horror start 1*.`);
    }

    const choiceKey = action === 'choose' ? parseChoice(args.slice(1)) : parseChoice(args);
    if (!choiceKey) {
      return m.reply(`${renderScene(game, (game.mode === 'real' ? REAL_CASES : CASES).find((item) => item.id === game.caseId))}\n\n_Use ${p}horror stop to abandon this case._`);
    }

    const story = (game.mode === 'real' ? REAL_CASES : CASES).find((item) => item.id === game.caseId);
    const scene = story.scenes[game.step];
    const choice = scene.choices.find((item) => item.key === choiceKey);
    if (!choice) return m.reply.error('That choice is not available in this scene. Choose A, B, or C.');

    game.sanity = Math.max(0, game.sanity + (choice.sanity || 0));
    game.clues += choice.clue || 0;
    if (!game.players.includes(m.sender)) game.players.push(m.sender);
    game.history.push({ step: game.step, choice: choice.key, by: m.sender, at: Date.now() });

    let response = `🕯️ *${choice.label}*\n\n${choice.text}\n\n`;
    if (choice.ending) {
      const ending = game.mode === 'real'
        ? { title: 'CASE FILE COMPLETE', text: story.conclusion }
        : ENDINGS[choice.ending];
      game.ended = true;
      game.endingTitle = ending.title;
      saveGames(games);
      const sourceNote = game.mode === 'real'
        ? `\n\n📖 *Source:* ${story.sourceLabel}\n${story.source}`
        : '';
      const restart = game.mode === 'real' ? `${p}horror real start 1` : `${p}horror start 1`;
      response += `${ending.title}\n\n${ending.text}${sourceNote}\n\n🧠 Final sanity: ${game.sanity}%  •  🔎 Clues: ${game.clues}\n\n_Start a new case with ${restart}._`;
      return m.reply(response);
    }

    game.step = choice.next;
    saveGames(games);
    response += renderScene(game, story);
    return m.reply(response);
  },
};
