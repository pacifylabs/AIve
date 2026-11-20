import { roleTone } from '@/lib/staff';

const SIZES = {
  sm: 'size-7 rounded-lg text-xs',
  md: 'size-11 rounded-xl text-base',
  lg: 'size-16 rounded-2xl text-2xl',
};

/** A staff member's face: their initial on their role's colour. Decorative; their name is always beside it. */
export function StaffAvatar({
  name,
  roleKey,
  size = 'md',
}: {
  name: string;
  roleKey: string;
  size?: keyof typeof SIZES;
}) {
  const tone = roleTone(roleKey);
  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center font-semibold ${SIZES[size]} ${
        tone === 'sales' ? 'bg-sales-soft text-sales' : 'bg-social-soft text-social'
      }`}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
