/**
 * Render a Xero date as YYYY-MM-DD.
 *
 * Several payroll models type their date fields as `string` but the SDK
 * deserialises them into `Date` objects, so interpolating one directly yields
 * a locale- and timezone-dependent string such as
 * "Sun Jul 26 2026 10:00:00 GMT+1000 (AEST)". Dates chosen for journals and
 * reporting periods have to be unambiguous.
 */
export const formatXeroDate = (
  value: string | Date | undefined | null,
): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? undefined
      : value.toISOString().slice(0, 10);
  }

  // Already YYYY-MM-DD (optionally with a time component) — take the date part.
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (iso) return iso[1];

  // Xero's legacy /Date(1234567890000+0000)/ format.
  const legacy = /\/Date\((-?\d+)/.exec(value);
  if (legacy) {
    const parsed = new Date(Number(legacy[1]));
    return Number.isNaN(parsed.getTime())
      ? undefined
      : parsed.toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toISOString().slice(0, 10);
};
