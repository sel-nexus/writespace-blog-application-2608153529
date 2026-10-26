/** Present display-name initials without decorative icon glyphs. */
import PropTypes from 'prop-types';

/** Derive initials safely for empty or multiword display names. @returns {JSX.Element} */
export function Avatar({ displayName = '' }) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const initials = words.length ? words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() : '?';
  return (
    <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light font-semibold text-primary">
      {initials}
    </span>
  );
}
Avatar.propTypes = { displayName: PropTypes.string };
