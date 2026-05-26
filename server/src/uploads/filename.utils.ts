import * as path from 'path';

const MAX_FILENAME_LENGTH = 180;
const UNSAFE_CHARACTER_PATTERN = /[<>:"/\\|?*]+/g;
const WHITESPACE_PATTERN = /\s+/g;

export function sanitizeDisplayFilename(
  originalFilename: string,
  normalizedExtension: string,
): string {
  const rawBaseName = path.basename(
    originalFilename,
    path.extname(originalFilename),
  );
  const normalizedBaseName = rawBaseName
    .normalize('NFKC')
    .split('')
    .filter((character) => {
      const codePoint = character.charCodeAt(0);

      return codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join('')
    .replace(UNSAFE_CHARACTER_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();

  const safeBaseName = normalizedBaseName || 'image';
  const truncatedBaseName = safeBaseName.slice(
    0,
    Math.max(1, MAX_FILENAME_LENGTH - normalizedExtension.length),
  );

  return `${truncatedBaseName}${normalizedExtension}`;
}
