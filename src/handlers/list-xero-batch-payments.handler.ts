import { BatchPayment } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { dateRangeClauses, joinWhere } from "../helpers/xero-where.js";
import { XeroClientResponse } from "../types/tool-response.js";

/**
 * List batch payments, newest first.
 */
export async function listXeroBatchPayments(
  dateFrom?: string,
  dateTo?: string,
): Promise<XeroClientResponse<BatchPayment[]>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.accountingApi.getBatchPayments(
      xeroClient.tenantId,
      undefined, // ifModifiedSince
      joinWhere(dateRangeClauses("Date", dateFrom, dateTo)), // where
      "Date DESC", // order
      getClientHeaders(),
    );

    return {
      result: response.body.batchPayments ?? [],
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

/**
 * Get one batch payment, including the payments that make it up.
 */
export async function getXeroBatchPayment(
  batchPaymentId: string,
): Promise<XeroClientResponse<BatchPayment>> {
  try {
    await xeroClient.authenticate();

    const response = await xeroClient.accountingApi.getBatchPayment(
      xeroClient.tenantId,
      batchPaymentId,
      getClientHeaders(),
    );

    const batchPayment = response.body.batchPayments?.[0];
    if (!batchPayment) {
      throw new Error(
        `No batch payment with ID ${batchPaymentId} exists in this organisation.`,
      );
    }

    return {
      result: batchPayment,
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
