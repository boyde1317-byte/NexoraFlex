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

function renderCaseList(prefix) {
  return [
    '🕯️ *HAUNTED CASE FILES*',
    '',
    ...CASES.map((item) => `${item.icon} *${item.id}. ${item.title}*\n_${item.hook}_`),
    '',
    `Start one with *${prefix}horror start 1*`,
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
  description: 'Play an interactive paranormal case with branching endings. Usage: .horror start 1',
  cooldown: 1500,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const games = gamesStore();
    const jid = m.from;
    const action = (args[0] || '').toLowerCase();

    if (!args.length || ['help', 'cases', 'list'].includes(action)) {
      return m.reply(renderCaseList(p));
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
      const story = CASES.find((item) => item.id === game.caseId);
      return m.reply(`${story.icon} *${story.title}*\n\n🧠 Sanity: ${Math.max(0, game.sanity)}%\n🔎 Clues: ${game.clues}\n📍 Scene: ${game.step + 1}/${story.scenes.length}\n👥 Investigators: ${game.players.length || 1}`);
    }

    let caseNumber = null;
    if (action === 'start' || action === 'new' || action === 'begin') {
      caseNumber = Number.parseInt(args[1], 10);
    } else if (/^\d+$/.test(action)) {
      caseNumber = Number.parseInt(action, 10);
    }

    if (caseNumber !== null && Number.isInteger(caseNumber)) {
      const story = CASES.find((item) => item.id === caseNumber);
      if (!story) return m.reply.error(`Choose a case from 1 to ${CASES.length}. Use *${p}horror* to see the files.`);
      const nextGame = {
        caseId: story.id,
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
      return m.reply(`${renderCaseList(p)}\n\n_Choose a number to start a case._`);
    }

    if (game.ended) {
      return m.reply(`This case is already closed: *${game.endingTitle}*\n\nStart another with *${p}horror start 1*.`);
    }

    const choiceKey = action === 'choose' ? parseChoice(args.slice(1)) : parseChoice(args);
    if (!choiceKey) {
      return m.reply(`${renderScene(game, CASES.find((item) => item.id === game.caseId))}\n\n_Use ${p}horror stop to abandon this case._`);
    }

    const story = CASES.find((item) => item.id === game.caseId);
    const scene = story.scenes[game.step];
    const choice = scene.choices.find((item) => item.key === choiceKey);
    if (!choice) return m.reply.error('That choice is not available in this scene. Choose A, B, or C.');

    game.sanity = Math.max(0, game.sanity + (choice.sanity || 0));
    game.clues += choice.clue || 0;
    if (!game.players.includes(m.sender)) game.players.push(m.sender);
    game.history.push({ step: game.step, choice: choice.key, by: m.sender, at: Date.now() });

    let response = `🕯️ *${choice.label}*\n\n${choice.text}\n\n`;
    if (choice.ending) {
      const ending = ENDINGS[choice.ending];
      game.ended = true;
      game.endingTitle = ending.title;
      saveGames(games);
      response += `${ending.title}\n\n${ending.text}\n\n🧠 Final sanity: ${game.sanity}%  •  🔎 Clues: ${game.clues}\n\n_Start a new case with ${p}horror start 1._`;
      return m.reply(response);
    }

    game.step = choice.next;
    saveGames(games);
    response += renderScene(game, story);
    return m.reply(response);
  },
};
