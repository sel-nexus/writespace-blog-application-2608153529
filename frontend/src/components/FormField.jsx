/** Associate labels, required indicators and error messages with stable inputs. */
import PropTypes from 'prop-types';

export const primaryButton = [
  'min-h-11 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-editorial',
  'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-60 motion-safe:transition-colors motion-safe:duration-200',
].join(' ');
export const textLink = 'rounded text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Render a controlled required field with inline validation. @returns {JSX.Element} */
export function FormField({ id, label, value, onChange, type = 'text', autoComplete, error = '' }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-semibold text-foreground">
        {label}
        <span className="ml-1 text-foreground-muted" aria-hidden="true">*</span>
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required
        aria-required="true"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
FormField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  type: PropTypes.string,
  autoComplete: PropTypes.string,
  error: PropTypes.string,
};
