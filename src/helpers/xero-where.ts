const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date in YYYY-MM-DD form. */
export const isIsoDate = (value: string): boolean => {
  if (!ISO_DATE.test(value)) {
    return false;
  }

  // Rejects 2026-02-31, which Date would otherwise roll forward to March.
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  );
};

/**
 * Xero's `where` grammar wants its dates as DateTime(y,m,d), not as a string.
 */
export const toXeroDateTime = (isoDate: string, label: string): string => {
  if (!isIsoDate(isoDate)) {
    throw new Error(
      `${label} must be an ISO date in YYYY-MM-DD form, received "${isoDate}".`,
    );
  }

  const [year, month, day] = isoDate.split("-");
  return `DateTime(${year},${month},${day})`;
};

/**
 * Build a date-range `where` clause against a named date field.
 */
export const dateRangeClauses = (
  field: string,
  dateFrom?: string,
  dateTo?: string,
): string[] => {
  const clauses: string[] = [];

  if (dateFrom) {
    clauses.push(`${field}>=${toXeroDateTime(dateFrom, "dateFrom")}`);
  }

  if (dateTo) {
    clauses.push(`${field}<=${toXeroDateTime(dateTo, "dateTo")}`);
  }

  return clauses;
};

/** Join clauses with AND, or return undefined when there is nothing to filter. */
export const joinWhere = (clauses: string[]): string | undefined =>
  clauses.length > 0 ? clauses.join(" AND ") : undefined;
