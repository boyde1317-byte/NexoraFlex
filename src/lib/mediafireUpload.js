/**
 * MediaFire Core API upload helper.
 * Required environment: MEDIAFIRE_APP_ID, MEDIAFIRE_API_KEY,
 * MEDIAFIRE_EMAIL, MEDIAFIRE_PASSWORD. MEDIAFIRE_FOLDER_KEY is optional.
 */
import crypto from 'node:crypto';

const API = 'https://www.mediafire.com/api/1.2';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function xmlTag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? match[1].replace(/<[^>]+>/g, '').trim()
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'") : '';
}

function parseResponse(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.response || parsed;
  } catch {
    const body = text.match(/<response[^>]*>([\s\S]*?)<\/response>/i)?.[1] || text;
    const upload = body.match(/<doupload[^>]*>([\s\S]*?)<\/doupload>/i)?.[1] || '';
    const fileInfo = body.match(/<file_info[^>]*>([\s\S]*?)<\/file_info>/i)?.[1] || '';
    const linksBody = body.match(/<links[^>]*>([\s\S]*?)<\/links>/i)?.[1] || '';
    const link = linksBody.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '';
    const topLevel = body.replace(/<doupload[^>]*>[\s\S]*?<\/doupload>/i, '');
    return {
      result: xmlTag(topLevel, 'result'), message: xmlTag(body, 'message'), error: xmlTag(body, 'error'),
      session_token: xmlTag(body, 'session_token'),
      doupload: upload ? {
        result: xmlTag(upload, 'result'), status: xmlTag(upload, 'status'),
        key: xmlTag(upload, 'key'), quickkey: xmlTag(upload, 'quickkey'),
        fileerror: xmlTag(upload, 'fileerror'), description: xmlTag(upload, 'description'),
      } : undefined,
      file_info: fileInfo ? { quickkey: xmlTag(fileInfo, 'quickkey'), links: {
        view: xmlTag(fileInfo, 'view'), normal_download: xmlTag(fileInfo, 'normal_download'),
      } } : undefined,
      links: link ? [{ view: xmlTag(link, 'view'), normal_download: xmlTag(link, 'normal_download') }] : undefined,
    };
  }
}

async function callApi(endpoint, params = {}, init = {}) {
  const url = new URL(`${API}/${endpoint}.php`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout || 90000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`MediaFire API returned HTTP ${response.status}.`);
  const data = parseResponse(text);
  if (data.result && data.result !== 'Success') {
    const reason = data.message || (data.error ? `error ${data.error}` : 'request rejected');
    throw new Error(`MediaFire API: ${reason}.`);
  }
  return data;
}

function getConfig() {
  const config = {
    appId: process.env.MEDIAFIRE_APP_ID?.trim(),
    apiKey: process.env.MEDIAFIRE_API_KEY?.trim(),
    email: process.env.MEDIAFIRE_EMAIL?.trim(),
    password: process.env.MEDIAFIRE_PASSWORD,
    folderKey: process.env.MEDIAFIRE_FOLDER_KEY?.trim(),
  };
  if (!config.appId || !config.apiKey || !config.email || !config.password) {
    throw new Error('MediaFire is not configured. Set MEDIAFIRE_APP_ID, MEDIAFIRE_API_KEY, MEDIAFIRE_EMAIL, and MEDIAFIRE_PASSWORD on the bot host.');
  }
  return config;
}

async function getSessionToken(config) {
  // MediaFire documents the session-token signature as SHA-1 of the
  // concatenated credentials in this exact order.
  const signature = crypto.createHash('sha1')
    .update(`${config.email}${config.password}${config.appId}${config.apiKey}`)
    .digest('hex');
  const form = new URLSearchParams({
    application_id: config.appId,
    email: config.email,
    password: config.password,
    signature,
    token_version: '1',
    response_format: 'json',
  });
  const data = await callApi('user/get_session_token', {}, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!data.session_token) throw new Error('MediaFire did not return a session token.');
  return data.session_token;
}

/** Upload a whole file buffer and return its public MediaFire view/download URL. */
export async function uploadToMediaFire(buffer, originalFilename) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('There is no file data to upload.');
  const config = getConfig();
  const sessionToken = await getSessionToken(config);
  // MediaFire expects a filename header; keep it printable ASCII for HTTP header safety.
  const filename = String(originalFilename || 'nexora-upload.zip')
    .normalize('NFKD').replace(/[^\x20-\x7E]/g, '_').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
  if (filename.length < 3) throw new Error('The MediaFire filename must be at least 3 characters.');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const upload = await callApi('upload/simple', {
    session_token: sessionToken,
    folder_key: config.folderKey,
    action_on_duplicate: 'keep',
    response_format: 'json',
  }, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-filename': filename,
      'x-filesize': String(buffer.length),
      'x-filehash': hash,
    },
    body: buffer,
  });
  const uploadKey = upload.doupload?.key;
  if (!uploadKey || upload.doupload?.result && upload.doupload.result !== '0') {
    throw new Error('MediaFire did not accept the file upload.');
  }

  let quickkey;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const poll = await callApi('upload/poll_upload', { key: uploadKey, response_format: 'json' });
    const status = poll.doupload?.status;
    if (poll.doupload?.result && poll.doupload.result !== '0') {
      throw new Error(poll.doupload.description || 'MediaFire could not complete the upload.');
    }
    if (poll.doupload?.fileerror) {
      throw new Error(`MediaFire rejected the file (file error ${poll.doupload.fileerror}).`);
    }
    if (poll.doupload?.quickkey) {
      quickkey = poll.doupload.quickkey;
      break;
    }
    if (status === '99') break;
  }
  if (!quickkey) throw new Error('MediaFire upload is still processing; no share link was returned.');

  const links = await callApi('file/get_links', {
    quick_key: quickkey,
    link_type: 'view',
    response_format: 'json',
  });
  const link = Array.isArray(links.links) ? links.links[0] : links.links?.link?.[0] || links.links?.link;
  const shareUrl = link?.view || link?.normal_download || `https://www.mediafire.com/file/${quickkey}`;
  return { filename, quickkey, url: shareUrl };
}
