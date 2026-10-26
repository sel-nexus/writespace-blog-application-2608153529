/** Present a defined count or a deliberately empty requested metric position. */
import PropTypes from 'prop-types';

/** Reserved positions intentionally ignore labels and values.
 * @param {{label?:string,value?:number,reserved?:boolean}} props Metric presentation.
 * @returns {JSX.Element} A metric card, with no invented content in reserved positions.
 */
export function StatCard({ label, value, reserved = false }) {
  return (
    <div
      data-testid="stat-card"
      aria-hidden={reserved ? 'true' : undefined}
      className="min-h-32 rounded-2xl border border-border bg-surface p-6"
    >
      {!reserved && (
        <>
          <p className="font-semibold text-foreground-muted">{label}</p>
          <p className="mt-3 font-display text-4xl font-bold tabular-nums text-primary">{value}</p>
        </>
      )}
    </div>
  );
}
StatCard.propTypes = {
  label: PropTypes.string,
  value: PropTypes.number,
  reserved: PropTypes.bool,
};
