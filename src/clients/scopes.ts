/**
 * Scopes requested by the authorization-code (standard OAuth 2.0 web app) flow.
 *
 * Granular scopes only — apps created from Apr 2026 cannot request the legacy
 * bundled scopes (`accounting.transactions` et al).
 *
 * Deliberately absent:
 *  - `accounting.journals.read` — Advanced tier + certification only; requesting
 *    it fails the whole authorisation.
 *  - payroll write scopes — payroll is read-only here. Adding a payroll write
 *    tool later means re-authorising every organisation, so it is not requested
 *    speculatively.
 */
export const XERO_AUTH_SCOPES: string[] = [
  // OIDC + refresh tokens. offline_access is what makes tokens survive a
  // restart; without it there is no refresh token at all.
  "openid",
  "profile",
  "email",
  "offline_access",

  // Reference data
  "accounting.contacts",
  "accounting.settings",

  // Transactions (read + write)
  "accounting.invoices",
  "accounting.payments",
  "accounting.banktransactions",
  "accounting.manualjournals",

  // Reports — each is a separate granular scope; omitting one 403s that report
  "accounting.reports.aged.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.profitandloss.read",
  "accounting.reports.trialbalance.read",

  // Payroll (read-only)
  "payroll.employees.read",
  "payroll.payruns.read",
  "payroll.payslip.read",
  "payroll.settings.read",
  "payroll.timesheets.read",
];

/** Space-separated form, as required by the Xero identity endpoints. */
export const XERO_AUTH_SCOPE_STRING = XERO_AUTH_SCOPES.join(" ");

/**
 * Callback port. Not 5000: on macOS, ControlCenter (AirPlay Receiver) binds it
 * by default, which makes the flow fail with EADDRINUSE.
 */
export const DEFAULT_REDIRECT_URI = "http://localhost:8787/callback";
