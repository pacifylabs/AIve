/** Shared by the server page and the client forms, so it cannot live in a 'use client' module. */
export const FACT_KINDS = [
  ['offering', 'What you sell'],
  ['offer', 'Offers and trials'],
  ['price', 'Prices'],
  ['claim', 'Claims you can back up'],
  ['faq', 'Common questions'],
  ['link_domain', 'Domains staff may link to'],
  ['banned', 'Never say'],
] as const;
