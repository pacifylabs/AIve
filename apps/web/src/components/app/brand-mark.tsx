/** The product's mark: a check that climbs in steps toward a square, for staff who earn their way up. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="8" fill="#2563eb" />
      <path
        d="M8 19h4v-4h4v-4h4"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="18.5" y="7.5" width="3" height="3" rx="0.6" fill="#ffffff" />
    </svg>
  );
}

/** One name everywhere in the app, matching the public site. */
export const PRODUCT_NAME = 'AI as a Staff';
