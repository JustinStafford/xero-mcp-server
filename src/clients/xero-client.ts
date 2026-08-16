import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import {
  IXeroClientConfig,
  Organisation,
  TokenSet,
  XeroClient,
} from "xero-node";

import { ensureError } from "../helpers/ensure-error.js";
import { tenantContext } from "./tenant-context.js";
import { DEFAULT_REDIRECT_URI, XERO_AUTH_SCOPES } from "./scopes.js";
import {
  StoredTokenSet,
  isExpiring,
  readTokenSet,
  writeTokenSet,
} from "./token-store.js";

dotenv.config();

const client_id = process.env.XERO_CLIENT_ID;
const client_secret = process.env.XERO_CLIENT_SECRET;
const bearer_token = process.env.XERO_CLIENT_BEARER_TOKEN;
const auth_mode = process.env.XERO_AUTH_MODE;
const grant_type = "client_credentials";

if (!bearer_token && (!client_id || !client_secret)) {
  throw Error("Environment Variables not set - please check your .env file");
}

abstract class MCPXeroClient extends XeroClient {
  private fallbackTenantId: string;
  private shortCodes: Map<string, string>;

  protected constructor(config?: IXeroClientConfig) {
    super(config);
    this.fallbackTenantId = "";
    this.shortCodes = new Map();
  }

  /**
   * The organisation targeted by the current tool call.
   *
   * Reads from the per-call async context when one is active, so concurrent
   * calls against different organisations cannot overwrite each other. Falls
   * back to the process-wide value used by the single-organisation auth modes
   * (custom connections, bearer token), which are unaffected by this.
   */
  public get tenantId(): string {
    return tenantContext.getStore()?.tenantId ?? this.fallbackTenantId;
  }

  public set tenantId(tenantId: string) {
    this.fallbackTenantId = tenantId;
  }

  public abstract authenticate(): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async updateTenants(fullOrgDetails?: boolean): Promise<any[]> {
    await super.updateTenants(fullOrgDetails);
    if (this.tenants && this.tenants.length > 0) {
      this.tenantId = this.tenants[0].tenantId;
    }
    return this.tenants;
  }

  private async getOrganisation(): Promise<Organisation> {
    await this.authenticate();

    const organisationResponse = await this.accountingApi.getOrganisations(
      this.tenantId || "",
    );

    const organisation = organisationResponse.body.organisations?.[0];

    if (!organisation) {
      throw new Error("Failed to retrieve organisation");
    }

    return organisation;
  }

  /**
   * Short code for the organisation of the current call.
   *
   * Keyed by tenant: a single cached value would hand back the first
   * organisation's short code for every subsequent organisation, producing
   * deep links that point at the wrong entity.
   */
  public async getShortCode(): Promise<string | undefined> {
    const tenantId = this.tenantId;
    const cached = this.shortCodes.get(tenantId);
    if (cached) return cached;

    try {
      const organisation = await this.getOrganisation();
      const shortCode = organisation.shortCode ?? "";
      this.shortCodes.set(tenantId, shortCode);
      return shortCode;
    } catch (error: unknown) {
      const err = ensureError(error);

      throw new Error(`Failed to get Organisation short code: ${err.message}`);
    }
  }
}

class CustomConnectionsXeroClient extends MCPXeroClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  // Legacy scopes (deprecated but still supported for existing apps)
  private readonly XERO_DEFAULT_AUTH_SCOPES_V1 = [
    "accounting.transactions",
    "accounting.contacts",
    "accounting.settings",
    "accounting.reports.read",
    "payroll.settings",
    "payroll.employees",
    "payroll.timesheets",
  ].join(" ");

  // Granular scopes (required for new apps)
  private readonly XERO_DEFAULT_AUTH_SCOPES_V2 = [
    "accounting.invoices",
    "accounting.payments",
    "accounting.banktransactions",
    "accounting.manualjournals",
    "accounting.reports.aged.read",
    "accounting.reports.balancesheet.read",
    "accounting.reports.profitandloss.read",
    "accounting.reports.trialbalance.read",
    "accounting.contacts",
    "accounting.settings",
    "payroll.settings",
    "payroll.employees",
    "payroll.timesheets",
  ].join(" ");

  constructor(config: {
    clientId: string;
    clientSecret: string;
    grantType: string;
  }) {
    super(config);
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  private formatTokenError(error: unknown, context: string): Error {
    const axiosError = error as AxiosError;
    const data = axiosError.response?.data;
    const message =
      typeof data === "object" ? JSON.stringify(data) : data || axiosError.message;
    return new Error(`Failed to get Xero token${context}: ${message}`);
  }

  public async getClientCredentialsToken(): Promise<TokenSet> {
    // If XERO_SCOPES is set, use that
    if (process.env.XERO_SCOPES) {                                                                                                                                                     
      try {
        return await this.requestToken(process.env.XERO_SCOPES);
      } catch (envError) {
        throw this.formatTokenError(envError, " with XERO_SCOPES");
      }
    }

    // Else if XERO_SCOPES is not set, try V1 scopes first (for existing apps), fallback to V2 scopes (for new apps) only on invalid_scope error
    try {
      return await this.requestToken(this.XERO_DEFAULT_AUTH_SCOPES_V1);
    } catch (error) {
      const axiosError = error as AxiosError;
      const isInvalidScope =
        axiosError.response?.status === 400 &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (axiosError.response?.data as any)?.error === "invalid_scope";

      if (!isInvalidScope) {
        throw this.formatTokenError(error, " with V1 scopes");
      }

      try {
        return await this.requestToken(this.XERO_DEFAULT_AUTH_SCOPES_V2);
      } catch (v2Error) {
        throw this.formatTokenError(v2Error, " with V2 scopes");
      }
    }
  }

  private async requestToken(scope: string): Promise<TokenSet> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    const response = await axios.post(
      "https://identity.xero.com/connect/token",
      `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    // Get the tenant ID from the connections endpoint
    const token = response.data.access_token;
    const connectionsResponse = await axios.get(
      "https://api.xero.com/connections",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );

    if (connectionsResponse.data && connectionsResponse.data.length > 0) {
      this.tenantId = connectionsResponse.data[0].tenantId;
    }

    return response.data;
  }

  public async authenticate() {
    const tokenResponse = await this.getClientCredentialsToken();

    this.setTokenSet({
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type,
    });
  }
}

class BearerTokenXeroClient extends MCPXeroClient {
  private readonly bearerToken: string;

  constructor(config: { bearerToken: string }) {
    super();
    this.bearerToken = config.bearerToken;
  }

  async authenticate(): Promise<void> {
    this.setTokenSet({
      access_token: this.bearerToken,
    });

    await this.updateTenants();
  }
}

/**
 * Standard OAuth 2.0 authorization-code client.
 *
 * Unlike custom connections (one org per credential set), a single
 * authorisation here spans every organisation the user consented to, so one
 * running server can read and write across all of them.
 *
 * Tokens are loaded from disk rather than re-minted per call, and refreshed
 * only when close to expiry. Authorisation itself is a separate, interactive
 * step — see `src/cli/authorise.ts`.
 */
class AuthCodeXeroClient extends MCPXeroClient {
  private refreshInFlight: Promise<void> | null = null;

  constructor(config: { clientId: string; clientSecret: string }) {
    super({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUris: [process.env.XERO_REDIRECT_URI || DEFAULT_REDIRECT_URI],
      scopes: XERO_AUTH_SCOPES,
    });
  }

  public async authenticate(): Promise<void> {
    const stored = readTokenSet();

    if (!stored) {
      throw new Error(
        "Not authorised with Xero. Run `npm run authorise` to connect your organisations.",
      );
    }

    if (!isExpiring(stored)) {
      this.setTokenSet(stored);
      return;
    }

    // Collapse concurrent refreshes. Cross-organisation work issues parallel
    // tool calls; if two of them both saw an expired token they would each
    // refresh, and the loser would be holding a refresh token that Xero had
    // already rotated away.
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshFrom(stored).finally(() => {
        this.refreshInFlight = null;
      });
    }

    await this.refreshInFlight;
  }

  private async refreshFrom(stored: StoredTokenSet): Promise<void> {
    if (!stored.refresh_token) {
      throw new Error(
        "Xero access token has expired and no refresh token is stored. " +
          "Run `npm run authorise` again and ensure offline_access is granted.",
      );
    }

    let refreshed;
    try {
      refreshed = await this.refreshWithRefreshToken(
        this.config?.clientId,
        this.config?.clientSecret,
        stored.refresh_token,
      );
    } catch (error: unknown) {
      const err = ensureError(error);
      throw new Error(
        `Failed to refresh Xero token: ${err.message}. ` +
          "If this persists, re-run `npm run authorise`.",
      );
    }

    // Persist before use: the previous refresh token died the instant Xero
    // issued this one, so an unwritten rotation locks the server out.
    writeTokenSet(refreshed as StoredTokenSet);
    this.setTokenSet(refreshed);
  }
}

export const xeroClient: MCPXeroClient =
  auth_mode === "oauth"
    ? new AuthCodeXeroClient({
        clientId: client_id!,
        clientSecret: client_secret!,
      })
    : bearer_token
      ? new BearerTokenXeroClient({
          bearerToken: bearer_token,
        })
      : new CustomConnectionsXeroClient({
          clientId: client_id!,
          clientSecret: client_secret!,
          grantType: grant_type,
        });
