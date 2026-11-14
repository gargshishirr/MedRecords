import { useCountUp } from '../lib/hooks';

/** A number that counts up on mount; screen readers get the final value only. */
export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const shown = useCountUp(value);
  const final = value.toFixed(decimals);
  return (
    <span className={className}>
      <span aria-hidden="true">{shown.toFixed(decimals)}</span>
      <span className="visually-hidden">{final}</span>
    </span>
  );
}
