import { Account } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { invalidateAccountCodes } from "../helpers/validate-account-codes.js";
import { XeroClientResponse } from "../types/tool-response.js";

async function createAccount(account: Account): Promise<Account | undefined> {
  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.createAccount(
    xeroClient.tenantId,
    account,
    undefined, // idempotencyKey
    getClientHeaders(),
  );

  const created = response.body.accounts?.[0];

  // The chart just changed. Without this the account-code guard would reject
  // the new code on the next write until its cache expired.
  invalidateAccountCodes();

  return created;
}

/**
 * Create a general ledger account in the organisation of the current call.
 */
export async function createXeroAccount(
  account: Account,
): Promise<XeroClientResponse<Account>> {
  try {
    const created = await createAccount(account);

    if (!created) {
      throw new Error("Account creation failed.");
    }

    // Xero reports field-level problems in the body rather than as an HTTP
    // error, so a "successful" response can still describe a rejection.
    const validationErrors = created.validationErrors ?? [];
    if (validationErrors.length > 0) {
      throw new Error(
        validationErrors.map((error) => error.message).join("; "),
      );
    }

    return {
      result: created,
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
