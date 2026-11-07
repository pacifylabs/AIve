export const TAG_COLOURS = ['blue', 'teal', 'green', 'amber', 'red', 'pink', 'purple', 'gray'] as const;
export type TagColour = (typeof TAG_COLOURS)[number];

export interface Tag {
  id: string;
  name: string;
  colour: TagColour;
}

/** A colour tag. The name is always written out: colour alone is never the only signal. */
export function TagPill({ tag }: { tag: Pick<Tag, 'name' | 'colour'> }) {
  return <span className={`tag tag-${tag.colour}`}>{tag.name}</span>;
}
