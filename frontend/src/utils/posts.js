/** Pure presentation helpers for browser-local posts; never mutate source records. */

/** Parse a legacy timestamp safely.
 * @param {*} value Stored timestamp.
 * @returns {number} Milliseconds, or NaN when the value is not a valid date string.
 */
function timestamp(value) {
  return typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
}

/** Sort valid dates newest first, retaining input order for ties and invalid dates.
 * @param {Array<import('./storage').Post>} posts Source collection.
 * @returns {Array<import('./storage').Post>} A new array, or an empty array for unsupported input.
 */
export function sortPosts(posts) {
  if (!Array.isArray(posts)) return [];
  return posts.map((post, index) => ({ post, index, time: timestamp(post?.createdAt) }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.time);
      const bValid = Number.isFinite(b.time);
      if (aValid && bValid) return b.time - a.time || a.index - b.index;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ post }) => post);
}

/** Format a date consistently in UTC without throwing on invalid legacy values.
 * @param {*} value Stored timestamp.
 * @returns {string} Readable date or an honest unavailable-date label.
 */
export function formatPostDate(value) {
  const time = timestamp(value);
  if (!Number.isFinite(time)) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(time));
}
