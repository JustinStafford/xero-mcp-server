import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { Contact, Phone } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import {
  BATCH_PAYMENT_DETAILS_MAX_LENGTH,
  ContactBatchPaymentsInput,
} from "./update-xero-contact.handler.js";

export interface CreateContactInput {
  name: string;
  email?: string;
  phone?: string;
  bankAccountDetails?: string;
  batchPayments?: ContactBatchPaymentsInput;
}

async function createContact(
  input: CreateContactInput,
): Promise<Contact | undefined> {
  await xeroClient.authenticate();

  const details = input.batchPayments?.details;
  if (details !== undefined && details.length > BATCH_PAYMENT_DETAILS_MAX_LENGTH) {
    throw new Error(
      `Bank reference "${details}" is ${details.length} characters. Xero allows at most ` +
        `${BATCH_PAYMENT_DETAILS_MAX_LENGTH} outside New Zealand, so shorten it before saving.`,
    );
  }

  const contact: Contact = {
    name: input.name,
    emailAddress: input.email,
    phones: input.phone
      ? [
          {
            phoneNumber: input.phone,
            phoneType: Phone.PhoneTypeEnum.MOBILE,
          },
        ]
      : undefined,
    bankAccountDetails: input.bankAccountDetails,
    batchPayments: input.batchPayments,
  };

  const response = await xeroClient.accountingApi.createContacts(
    xeroClient.tenantId,
    {
      contacts: [contact],
    }, //contacts
    true, //summarizeErrors
    undefined, //idempotencyKey
    getClientHeaders(), // options
  );

  return response.body.contacts?.[0];
}

/**
 * Create a new contact in Xero
 */
export async function createXeroContact(
  input: CreateContactInput,
): Promise<XeroClientResponse<Contact>> {
  try {
    const createdContact = await createContact(input);

    if (!createdContact) {
      throw new Error("Contact creation failed.");
    }

    return {
      result: createdContact,
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
