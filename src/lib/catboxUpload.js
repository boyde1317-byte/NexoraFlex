/**
 * Upload a complete in-memory file to Catbox.
 * Catbox accepts anonymous uploads; CATBOX_USERHASH is optional.
 */
const API_URL = 'https://catbox.moe/user/api.php';
const MAX_FILE_BYTES = 200 * 1024 * 1024;

export async function uploadToCatbox(buffer, originalFilename, mimeType = 'application/octet-stream') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('There is no file data to upload.');
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('The file exceeds Catbox’s 200 MB upload limit.');
  }

  const filename = String(originalFilename || 'nexora-upload.bin')
    .replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 180);
  const form = new FormData();
  form.set('reqtype', 'fileupload');
  const userhash = process.env.CATBOX_USERHASH?.trim();
  if (userhash) form.set('userhash', userhash);
  form.set('fileToUpload', new Blob([buffer], { type: mimeType }), filename);

  const response = await fetch(API_URL, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const text = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(`Catbox returned HTTP ${response.status}.`);
  }

  let result;
  try { result = new URL(text); } catch {
    throw new Error(`Catbox upload failed: ${text.slice(0, 220) || 'no link returned'}`);
  }
  if (result.protocol !== 'https:' || result.hostname !== 'files.catbox.moe') {
    throw new Error(`Catbox upload failed: ${text.slice(0, 220) || 'unexpected response'}`);
  }
  return { filename, url: result.toString() };
}
