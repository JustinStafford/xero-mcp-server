import { updateXeroContact } from "../../handlers/update-xero-contact.handler.js";
import { z } from "zod";
import { DeepLinkType, getDeepLink } from "../../helpers/get-deeplink.js";
import { ensureError } from "../../helpers/ensure-error.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import {
  bankAccountDetailsSchema,
  batchPaymentsSchema,
  formatContactBankDetails,
} from "../../helpers/contact-bank-details.js";

const UpdateContactTool = CreateXeroTool(
  "update-contact",
  "Update a contact in Xero. Only the fields you supply are changed; everything else \
is left as it is, so a partial update is safe. \
 When a contact is updated, a deep link to the contact in Xero is returned. \
 This deep link can be used to view the contact in Xero directly. \
 This link should be displayed to the user.",
  {
    contactId: z.string(),
    name: z
      .string()
      .optional()
      .describe(
        "Only supply this to RENAME the contact. Leave it out to keep the current name.",
      ),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z
      .object({
        addressLine1: z.string(),
        addressLine2: z.string().optional(),
        city: z.string().optional(),
        region: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
      })
      .optional(),
    bankAccountDetails: bankAccountDetailsSchema,
    batchPayments: batchPaymentsSchema,
  },
  async ({
    contactId,
    name,
    firstName,
    lastName,
    email,
    phone,
    address,
    bankAccountDetails,
    batchPayments,
  }) => {
    try {
      const response = await updateXeroContact({
        contactId,
        name,
        firstName,
        lastName,
        email,
        phone,
        address,
        bankAccountDetails,
        batchPayments,
      });
      if (response.isError) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating contact: ${response.error}`,
            },
          ],
        };
      }

      const contact = response.result;

      const deepLink = contact.contactID
        ? await getDeepLink(DeepLinkType.CONTACT, contact.contactID)
        : null;

      const bankDetailsChanged =
        bankAccountDetails !== undefined || batchPayments !== undefined;

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Contact updated: ${contact.name} (ID: ${contact.contactID})`,
              ...(bankDetailsChanged ? formatContactBankDetails(contact) : []),
              deepLink ? `Link to view: ${deepLink}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    } catch (error) {
      const err = ensureError(error);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating contact: ${err.message}`,
          },
        ],
      };
    }
  },
);

export default UpdateContactTool;
