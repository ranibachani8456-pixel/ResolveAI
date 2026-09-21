const DEFAULT_TARGET_SIZE = 1_000;
const DEFAULT_OVERLAP = 150;
const MIN_BREAK_POSITION_RATIO = 0.6;

function findBreak(text, start, upperBound, minimumBreak) {
  const window = text.slice(start, upperBound);
  const candidates = [window.lastIndexOf("\n\n") + 2];
  const sentencePattern = /[.!?]["')\]]?\s+/g;
  let match;
  while ((match = sentencePattern.exec(window))) candidates.push(match.index + match[0].length);
  candidates.push(window.lastIndexOf("\n") + 1, window.lastIndexOf(" ") + 1);
  return candidates.filter((offset) => offset >= minimumBreak - start).sort((a, b) => b - a)[0] ?? upperBound - start;
}

export function chunkDocumentText(text, options = {}) {
  const targetSize = options.targetSize ?? DEFAULT_TARGET_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  if (typeof text !== "string" || !text.trim()) return [];
  if (!Number.isInteger(targetSize) || targetSize < 200 || !Number.isInteger(overlap) || overlap < 0 || overlap >= targetSize / 2) {
    throw new Error("Invalid document chunking configuration");
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const upperBound = Math.min(start + targetSize, text.length);
    const minimumBreak = Math.min(start + Math.floor(targetSize * MIN_BREAK_POSITION_RATIO), upperBound);
    const end = upperBound === text.length
      ? upperBound
      : start + findBreak(text, start, upperBound, minimumBreak);
    const chunkText = text.slice(start, end).trim();
    if (chunkText) chunks.push({ chunkIndex: chunks.length, text: chunkText });
    if (end >= text.length) break;

    let nextStart = Math.max(start + 1, end - overlap);
    const whitespace = text.slice(nextStart, end).search(/\s/);
    if (whitespace >= 0) nextStart += whitespace + 1;
    start = Math.min(nextStart, end);
  }
  return chunks;
}
