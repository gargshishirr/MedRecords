const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** `₹1,45,000` (Indian digit grouping). */
export function formatINR(amount: number): string {
  return inr.format(amount);
}

export function formatSigned(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  if (Number(fixed) === 0) return `±${fixed}`;
  return `${value > 0 ? '+' : '−'}${fixed}`;
}

export function formatFileSize(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
