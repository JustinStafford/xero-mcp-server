import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import {
  Address,
  BatchPaymentDetails,
  Contact,
  Contacts,
  Phone,
} from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";

export interface ContactAddressInput {
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

/**
 * The structured bank block Xero reads when building a batch payment or an ABA
 * file. Distinct from `bankAccountDetails`, which is a single informational
 * text field and is not used by batch payments.
 */
export interface ContactBatchPaymentsInput {
  bankAccountNumber?: string;
  bankAccountName?: string;
  details?: string;
  code?: string;
  reference?: string;
}

export interface UpdateContactInput {
  contactId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: ContactAddressInput;
  bankAccountDetails?: string;
  batchPayments?: ContactBatchPaymentsInput;
}

/** Xero truncates past this; it is the bank reference, not a description. */
export const BATCH_PAYMENT_DETAILS_MAX_LENGTH = 18;

export async function getXeroContactById(contactId: string): Promise<Contact> {
  const response = await xeroClient.accountingApi.getContact(
    xeroClient.tenantId,
    contactId,
    getClientHeaders(),
  );

  const contact = response.body.contacts?.[0];
  if (!contact) {
    throw new Error(
      `No contact with ID ${contactId} exists in this organisation.`,
    );
  }
  return contact;
}

/**
 * Replace the mobile number while leaving every other phone type in place.
 *
 * Xero replaces the whole phones collection when one is supplied, so the
 * existing entries have to be sent back or they are lost.
 */
const mergePhones = (
  existing: Phone[] | undefined,
  phone: string | undefined,
): Phone[] | undefined => {
  if (phone === undefined) {
    return undefined;
  }

  const others = (existing ?? []).filter(
    (entry) => entry.phoneType !== Phone.PhoneTypeEnum.MOBILE,
  );

  return [
    ...others,
    { phoneNumber: phone, phoneType: Phone.PhoneTypeEnum.MOBILE },
  ];
};

/** Same reasoning as mergePhones: replace the street address, keep the rest. */
const mergeAddresses = (
  existing: Address[] | undefined,
  address: ContactAddressInput | undefined,
): Address[] | undefined => {
  if (address === undefined) {
    return undefined;
  }

  const others = (existing ?? []).filter(
    (entry) => entry.addressType !== Address.AddressTypeEnum.STREET,
  );

  return [
    ...others,
    {
      addressType: Address.AddressTypeEnum.STREET,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      country: address.country,
      postalCode: address.postalCode,
      region: address.region,
    },
  ];
};

/**
 * Merge field by field rather than replacing the block, so adding an account
 * number does not clear the bank reference already on file.
 */
const mergeBatchPayments = (
  existing: BatchPaymentDetails | undefined,
  update: ContactBatchPaymentsInput | undefined,
): BatchPaymentDetails | undefined => {
  if (update === undefined) {
    return undefined;
  }

  const merged: BatchPaymentDetails = { ...(existing ?? {}) };

  for (const key of [
    "bankAccountNumber",
    "bankAccountName",
    "details",
    "code",
    "reference",
  ] as const) {
    const value = update[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
};

async function updateContact(input: UpdateContactInput): Promise<Contact | undefined> {
  await xeroClient.authenticate();

  // Read first. A partial update that does not know the current state is how a
  // contact gets renamed by a call that only meant to add a phone number.
  const existing = await getXeroContactById(input.contactId);

  const details = input.batchPayments?.details;
  if (details !== undefined && details.length > BATCH_PAYMENT_DETAILS_MAX_LENGTH) {
    throw new Error(
      `Bank reference "${details}" is ${details.length} characters. Xero allows at most ` +
        `${BATCH_PAYMENT_DETAILS_MAX_LENGTH} outside New Zealand, so shorten it before saving.`,
    );
  }

  const phones = mergePhones(existing.phones, input.phone);
  const addresses = mergeAddresses(existing.addresses, input.address);
  const batchPayments = mergeBatchPayments(
    existing.batchPayments,
    input.batchPayments,
  );

  const contact: Contact = {
    // Always the existing name unless a new one was asked for explicitly.
    name: input.name ?? existing.name,
    ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
    ...(input.email !== undefined ? { emailAddress: input.email } : {}),
    ...(phones ? { phones } : {}),
    ...(addresses ? { addresses } : {}),
    ...(input.bankAccountDetails !== undefined
      ? { bankAccountDetails: input.bankAccountDetails }
      : {}),
    ...(batchPayments ? { batchPayments } : {}),
  };

  const contacts: Contacts = {
    contacts: [contact],
  };

  const response = await xeroClient.accountingApi.updateContact(
    xeroClient.tenantId,
    input.contactId, // contactId
    contacts, // contacts
    undefined, // idempotencyKey
    getClientHeaders(),
  );

  return response.body.contacts?.[0];
}

/**
 * Update an existing contact in Xero, merging with what is already stored.
 */
export async function updateXeroContact(
  input: UpdateContactInput,
): Promise<XeroClientResponse<Contact>> {
  try {
    const updatedContact = await updateContact(input);

    if (!updatedContact) {
      throw new Error("Contact update failed.");
    }

    return {
      result: updatedContact,
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
