/** X's limit for one post. Other networks allow far more, so it is the one worth showing while writing. */
export const X_LIMIT = 280;

/** Characters as a person counts them: an emoji or accented letter is one, not two UTF-16 units. */
export function postLength(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
}
