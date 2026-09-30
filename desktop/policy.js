export const OFFICE_URL = 'http://127.0.0.1:4310';
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export function isOfficeURL(value) {
  try {
    const url = new URL(value);
    return url.origin === OFFICE_URL && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function isExternalURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function assertTrustedSender(event, window) {
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isOfficeURL(event.senderFrame.url)
  ) {
    throw new Error('Native access is only available to the Butler office window.');
  }
}
export function validateTextExport(input) {
  if (!input || typeof input.text !== 'string' || Buffer.byteLength(input.text) > MAX_TEXT_BYTES) {
    throw new Error('Choose text smaller than 2 MB.');
  }
  const name = input.name || 'Butler-notes.txt';
  if (typeof name !== 'string' || !/^[\w .()-]{1,100}\.(txt|md|json|csv)$/i.test(name)) {
    throw new Error('Choose a simple .txt, .md, .json or .csv filename.');
  }
  return { text: input.text, name };
}
