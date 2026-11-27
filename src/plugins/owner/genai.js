/**
 * genai.js — owner-only test bench for the GenAI rich response envelope.
 *
 * Sends the Meta AI bot bubble format (botForwardedMessage + V2 unifiedResponse)
 * built by src/lib/genaiRich.js: markdown sections, progress pill, native
 * table/code primitives, thought steps and tabbed screens.
 *
 * Usage:
 *   .genai            → full demo (sections + Thoughts + tabs + HTML card)
 *   .genai table      → native table primitive only
 *   .genai code       → syntax-highlighted code primitive
 *   .genai steps      → "Thoughts / Steps" sheet only
 *   .genai tabs       → tabbed screen only
 *   .genai html       → sandboxed HTML mini-app card
 *   .genai env        → minimal envelope probe (markdown only)
 *   .genai parse      → reply to a bot message to dump its decoded structure
 *
 * Rendering depends on the client accepting the botMetadata proof, which is
 * unsigned here. Every send reports whether the relay landed or fell back.
 */
import { baileysBridge } from '../../core/baileysBridge.js';
import capabilities from '../../core/capabilities.js';
import {
  section,
  primitives,
  stepEntry,
  tab,
  tabbedScreen,
  thoughtsScreen,
  parseGenAIMessage,
} from '../../lib/genaiRich.js';

const SAMPLE_HTML = `<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b0f0d;color:#d7ffe6;font-family:'Courier New',monospace;padding:16px}
.card{border:1px solid #1f6b45;border-radius:14px;padding:18px;background:linear-gradient(160deg,#0f1a14,#07100b)}
h1{font-size:20px;color:#3dff9a;letter-spacing:1px}
p{font-size:13px;line-height:1.5;color:#8fd6b0;margin-top:8px}
.row{display:flex;gap:8px;margin-top:14px}
.pill{flex:1;text-align:center;padding:8px;border-radius:8px;background:#12291d;color:#3dff9a;font-size:12px}
</style>
<div class="card">
  <h1>NEXORA</h1>
  <p>Sandboxed HTML primitive rendered inside the bot bubble.</p>
  <div class="row"><div class="pill">PING 52ms</div><div class="pill">V2 ENVELOPE</div><div class="pill">GENAI</div></div>
</div>`;

const baseSections = (prefix) => [
  section(primitives.markdown(`*NEXORA GENAI TEST*\n\nPrefix: \`${prefix}\` — envelope built by src/lib/genaiRich.js`)),
  section(primitives.progress({ title: 'Processing' })),
];

const demoSteps = [
  stepEntry('Step 1 — Envelope', 'messageContextInfo.botMetadata + botForwardedMessage'),
  stepEntry('Step 2 — Payload', 'unifiedResponse.data = UTF-8 JSON, not base64'),
  stepEntry('Step 3 — Screens', 'embedded_screens carries tabs and thought steps'),
];

async function send(sock, m, spec, label) {
  const started = Date.now();
  const res = await baileysBridge.sendGenAIResponse(sock, m.from, spec, { quoted: m });
  const ms = Date.now() - started;
  const status = res.ok
    ? `✅ relayed in ${ms}ms\n• response_id: \`${res.responseId}\``
    : `⚠️ relay failed in ${ms}ms, text fallback sent\n• ${res.error}`;
  return m.reply(`${status}\n• mode: *${label}*`);
}

export default {
  name: 'genai',
  aliases: ['genaitest', 'botbubble'],
  category: 'owner',
  description: '🧠 Test bench for the GenAI rich response envelope (V2).',
  permissions: { owner: true },
  cooldown: 4000,

  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const mode = (args[0] || 'demo').toLowerCase();

    if (!capabilities.genaiRich) {
      return m.reply.error('GenAI envelope builder unavailable in this build.');
    }

    switch (mode) {
      case 'table':
        return send(sock, m, {
          sections: [
            ...baseSections(p),
            section(primitives.table({
              title: 'NEXORA STATUS',
              headers: ['Field', 'Value'],
              rows: [
                ['Uptime', '4h 12m'],
                ['Messages', '1,284'],
                ['Latency', '52 ms'],
                ['Envelope', 'V2 GenAI'],
              ],
            })),
          ],
        }, 'table');

      case 'code':
        return send(sock, m, {
          sections: [
            section(primitives.markdown('*Code primitive*')),
            section(primitives.code({
              language: 'javascript',
              code: [
                "import { sendGenAICard } from './genaiRich.js';",
                '',
                'await sendGenAICard(sock, jid, {',
                "  sections: [section(primitives.markdown('hi'))],",
                '});',
              ].join('\n'),
            })),
          ],
        }, 'code');

      case 'steps':
        return send(sock, m, {
          sections: [section(primitives.progress({ title: 'Thinking' }))],
          screens: [thoughtsScreen({ steps: demoSteps })],
        }, 'steps');

      case 'tabs':
        return send(sock, m, {
          sections: [section(primitives.markdown('*Tabbed screen*'))],
          screens: [
            tabbedScreen({
              title: 'Details',
              tabs: [
                tab({ id: 'info', header: 'Info', sections: [section(primitives.markdown('First tab body.'))] }),
                tab({ id: 'code', header: 'Code', sections: [section(primitives.code({ code: 'ping()', language: 'js' }))] }),
              ],
            }),
          ],
        }, 'tabs');

      case 'html':
        return send(sock, m, {
          sections: [section(primitives.markdown('*HTML primitive*'))],
          screens: [
            tabbedScreen({
              title: 'Card',
              tabs: [
                tab({
                  id: 'card',
                  header: 'Preview',
                  sections: [
                    section(primitives.html({
                      payload: SAMPLE_HTML,
                      url: 'https://github.com/boyde1317-byte/NEXORA-MD',
                      trustedSources: ['github.com', 'wa.me', 'whatsapp.com'],
                    })),
                  ],
                }),
              ],
            }),
          ],
        }, 'html');

      case 'env':
        return send(sock, m, {
          sections: [section(primitives.markdown('Envelope probe — markdown only.'))],
          fallbackText: 'Envelope probe — markdown only.',
        }, 'env');

      case 'parse': {
        if (!m.quoted?.message) {
          return m.reply.error('Reply to a bot / Meta AI message with `' + p + 'genai parse`.');
        }
        const parsed = parseGenAIMessage(m.quoted.message);
        if (!parsed.isGenAI) {
          return m.reply.error('Quoted message is not a botForwardedMessage / richResponseMessage.');
        }
        const lines = [
          '🧠 *GENAI MESSAGE*',
          '',
          `• response_id: \`${parsed.responseId || 'n/a'}\``,
          `• botResponseId: \`${parsed.botResponseId || 'n/a'}\``,
          `• botJid: \`${parsed.botJid || 'n/a'}\``,
          `• forwardOrigin: \`${parsed.forwardOrigin ?? 'n/a'}\``,
          `• sections: ${parsed.sections.length}`,
          `• screens: ${parsed.screens.length}`,
          '',
          '*Decoded text:*',
          parsed.text ? parsed.text.slice(0, 1200) : '_empty_',
        ];
        return m.reply(lines.join('\n'));
      }

      case 'demo':
      default:
        return send(sock, m, {
          sections: [
            ...baseSections(p),
            section(primitives.table({
              title: 'ENVELOPE',
              headers: ['Part', 'Value'],
              rows: [
                ['messageType', '1'],
                ['unifiedResponse', 'bytes (UTF-8 JSON)'],
                ['forwardOrigin', '4 (META_AI)'],
              ],
            })),
            section(primitives.code({
              language: 'javascript',
              code: "sendGenAICard(sock, jid, { sections, screens })",
            })),
          ],
          screens: [
            thoughtsScreen({ steps: demoSteps }),
            tabbedScreen({
              title: 'Card',
              tabs: [
                tab({ id: 'info', header: 'Info', sections: [section(primitives.markdown('Tabs render as a sheet under the bubble.'))] }),
                tab({ id: 'html', header: 'HTML', sections: [section(primitives.html({ payload: SAMPLE_HTML }))] }),
              ],
            }),
          ],
        }, 'demo');
    }
  },
};
