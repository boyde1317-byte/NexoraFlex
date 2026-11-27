/**
 * horrorfact.js — short, sourced U.S. horror and mystery facts.
 *
 * Usage:
 *   .horrorfact       random fact
 *   .horrorfact 2     choose a fact by number
 *   .horrorfact list  show the available topics
 *
 * Facts are kept non-graphic and distinguish documented reporting from
 * speculation. Each response includes its source for readers who want the
 * full case history.
 */

const FACTS = [
  {
    title: 'The Villisca timeline',
    fact: 'In Villisca, Iowa, eight people were killed in a home after a children’s church program on June 9, 1912. The case never reached a conclusive identification of the killer.',
    source: 'https://murderhouse.com/the-house-and-murders/the-murders/',
    sourceLabel: 'Villisca Axe Murder House — historical account',
  },
  {
    title: 'The locked house',
    fact: 'The Villisca historical account says the house was locked when the victims were discovered. That detail became one of the enduring questions in the case, but it does not identify who locked the door.',
    source: 'https://murderhouse.com/the-house-and-murders/the-murders/',
    sourceLabel: 'Villisca Axe Murder House — historical account',
  },
  {
    title: 'The Sodder children',
    fact: 'On Christmas Eve 1945, a fire destroyed the Sodder family home in Fayetteville, West Virginia. Five children were never seen again, and the family spent decades searching for answers.',
    source: 'https://www.wusf.org/2005-12-23/mystery-of-missing-children-haunts-w-va-town',
    sourceLabel: 'NPR report republished by WUSF',
  },
  {
    title: 'Rumor versus evidence',
    fact: 'The Sodder case attracted reports of possible sightings across the country, but the reported leads did not definitively locate the missing children. The case is a reminder that repetition is not proof.',
    source: 'https://www.wusf.org/2005-12-23/mystery-of-missing-children-haunts-w-va-town',
    sourceLabel: 'NPR report republished by WUSF',
  },
  {
    title: 'The Watcher letters',
    fact: 'After a family bought a house in Westfield, New Jersey, in 2014, letters from an unidentified writer calling themselves “The Watcher” reportedly made the family afraid to move in.',
    source: 'https://abcnews.com/US/alleged-stalker-watcher-sends-letter-specific-threats-nj/story?id=46480325',
    sourceLabel: 'ABC News — court documents and investigation reported in 2017',
  },
  {
    title: 'A human mystery, not a ghost story',
    fact: 'The Westfield Watcher report describes an alleged human harasser, police investigation, lawsuits, and public appeals for information. It does not establish a supernatural explanation or identify the writer.',
    source: 'https://abcnews.com/US/alleged-stalker-watcher-sends-letter-specific-threats-nj/story?id=46480325',
    sourceLabel: 'ABC News — court documents and investigation reported in 2017',
  },
];

function renderFact(item, number) {
  return [
    `🕯️ *HORROR FACT ${number}/${FACTS.length}*`,
    `*${item.title}*`,
    '',
    item.fact,
    '',
    `📖 *Source:* ${item.sourceLabel}`,
    item.source,
    '',
    '_Documented history, presented without graphic detail._',
  ].join('\n');
}

export default {
  name: 'horrorfact',
  aliases: ['horrorfacts', 'scaryfact', 'truehorror'],
  category: 'fun',
  description: 'Get a sourced, non-graphic U.S. horror fact. Usage: .horrorfact [number]',
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const input = (args[0] || '').toLowerCase();
    if (input === 'list' || input === 'help') {
      return m.reply([
        '🕯️ *HORROR FACTS*',
        '',
        ...FACTS.map((item, index) => `${index + 1}. ${item.title}`),
        '',
        `Use *${p}horrorfact* for a random fact or *${p}horrorfact 2* for a specific one.`,
      ].join('\n'));
    }

    const requested = Number.parseInt(input, 10);
    const index = Number.isInteger(requested) && requested >= 1 && requested <= FACTS.length
      ? requested - 1
      : Math.floor(Math.random() * FACTS.length);
    return m.reply(renderFact(FACTS[index], index + 1));
  },
};
