import path from 'node:path';

export function shortNameFor(rowid) {
  const n = Number(rowid);
  return Number.isFinite(n) && n > 0 ? `meta-${String(Math.trunc(n)).padStart(3, '0')}` : 'meta-capture';
}

function normalizeLanguage(value) {
  const language = String(value || 'javascript').trim().toLowerCase();
  const aliases = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', yml: 'yaml' };
  return aliases[language] || language.replace(/[^a-z0-9+#-]/g, '').slice(0, 24) || 'javascript';
}

function safeFilePart(value) {
  return String(value || 'capture').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48) || 'capture';
}

/** Extract structured code and ordinary fenced snippets from a captured response. */
export function extractCodeSnippet(...roots) {
  const found = [];
  const seen = new Set();
  const add = (code, language) => {
    if (typeof code !== 'string' || !code.trim()) return;
    const value = code.replace(/^\n+|\n+$/g, '');
    if (!value || seen.has(value)) return;
    seen.add(value);
    found.push({ code: value, language: normalizeLanguage(language) });
  };
  const addFenced = (text, language) => {
    if (typeof text !== 'string') return;
    const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = fence.exec(text))) add(match[2], match[1] || language);
  };
  const walk = (node, inheritedLanguage = 'javascript') => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, inheritedLanguage);
      return;
    }
    const language = node.language || node.codeLanguage || inheritedLanguage;
    if (Array.isArray(node.code_blocks)) {
      add(node.code_blocks.map((block) => block?.content ?? block?.codeContent ?? '').join(''), language);
    }
    if (Array.isArray(node.codeBlocks)) {
      add(node.codeBlocks.map((block) => block?.content ?? block?.codeContent ?? '').join(''), language);
    }
    if (typeof node.code === 'string') add(node.code, language);
    for (const key of ['text', 'messageText', 'markdown', 'caption', 'content']) addFenced(node[key], language);
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'code' && key !== 'code_blocks' && key !== 'codeBlocks'
        && key !== 'text' && key !== 'messageText' && key !== 'markdown'
        && key !== 'caption' && key !== 'content') walk(value, language);
    }
  };
  for (const root of roots) walk(root);
  if (!found.length) return null;
  return { language: found[0].language, code: found.map((item) => item.code).join('\n\n') };
}

export function buildJavascriptSource({ name, row, snippet }) {
  const header = [
    '/*',
    ` * NEXORA Meta AI capture: ${name}`,
    ` * Original message id: ${row.id}`,
    ` * Captured: ${row.created_at ? new Date(row.created_at * 1000).toISOString() : 'unknown'}`,
    ` * Source language: ${snippet?.language || 'json'}`,
    ' */',
    '',
  ].join('\n');
  if (snippet?.code) return `${header}${snippet.code}\n`;
  const payload = row.decoded ?? row.raw ?? {};
  return `${header}export default ${JSON.stringify(payload, null, 2)};\n`;
}

export function snippetFileName(name) {
  return `${safeFilePart(name)}.js`;
}

export function snippetDirectory(root = process.cwd()) {
  return path.join(root, 'data', 'richsniff-snippets');
}
