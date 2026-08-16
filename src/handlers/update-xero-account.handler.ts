import { Account } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { invalidateAccountCodes } from "../helpers/validate-account-codes.js";
import { XeroClientResponse } from "../types/tool-response.js";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an account code or ID to its Xero accountID.
 *
 * The update endpoint requires the GUID, but codes are what people actually
 * work in — and a GUID reproduced from memory is a silent way to edit the
 * wrong account. Ambiguity is an error rather than a guess.
 */
async function resolveAccountId(accountIdOrCode: string): Promise<string> {
  const query = accountIdOrCode.trim();

  if (GUID.test(query)) return query;

  const response = await xeroClient.accountingApi.getAccounts(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    undefined, // where
    undefined, // order
    getClientHeaders(),
  );

  const accounts = response.body.accounts ?? [];
  const matches = accounts.filter(
    (account) => account.code?.toLowerCase() === query.toLowerCase(),
  );

  if (matches.length === 0) {
    throw new Error(
      `No account with code "${query}" exists in this organisation. ` +
        "Call list-accounts to see the available codes.",
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Code "${query}" matches ${matches.length} accounts in this organisation. ` +
        "Pass the account ID instead.",
    );
  }

  const accountId = matches[0].accountID;
  if (!accountId) {
    throw new Error(`Account "${query}" has no account ID.`);
  }

  return accountId;
}

async function updateAccount(
  accountIdOrCode: string,
  changes: Account,
): Promise<Account | undefined> {
  await xeroClient.authenticate();

  const accountID = await resolveAccountId(accountIdOrCode);

  const response = await xeroClient.accountingApi.updateAccount(
    xeroClient.tenantId,
    accountID,
    { accounts: [{ ...changes, accountID }] },
    undefined, // idempotencyKey
    getClientHeaders(),
  );

  const updated = response.body.accounts?.[0];

  // Code, name or status may have changed — drop the guard's cached chart.
  invalidateAccountCodes();

  return updated;
}

/**
 * Update a general ledger account in the organisation of the current call.
 */
export async function updateXeroAccount(
  accountIdOrCode: string,
  changes: Account,
): Promise<XeroClientResponse<Account>> {
  try {
    const updated = await updateAccount(accountIdOrCode, changes);

    if (!updated) {
      throw new Error("Account update failed.");
    }

    const validationErrors = updated.validationErrors ?? [];
    if (validationErrors.length > 0) {
      throw new Error(
        validationErrors.map((error) => error.message).join("; "),
      );
    }

    return {
      result: updated,
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
