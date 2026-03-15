/**
 * Sentence splitter utility for hierarchical chunking.
 *
 * Provides a single exported function that splits a block of text into
 * individual sentences.  Uses `Intl.Segmenter` (Node 16+ built-in) as the
 * primary implementation and falls back to a regex-based approach for
 * environments where the API is unavailable.
 */

/**
 * Split a text into individual sentences.
 *
 * @param text - The text to split
 * @returns Array of non-empty, trimmed sentence strings
 */
export function splitIntoSentences(text: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IntlAny = Intl as any;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new IntlAny.Segmenter('en', { granularity: 'sentence' });
    return Array.from(segmenter.segment(text) as Iterable<{ segment: string }>)
      .map(s => s.segment.trim())
      .filter(Boolean);
  }
  // Fallback: split on sentence-ending punctuation followed by whitespace
  return text.match(/[^.!?]+[.!?]+[\s]*/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
}
