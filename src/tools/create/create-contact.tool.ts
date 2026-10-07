import { createXeroContact } from "../../handlers/create-xero-contact.handler.js";
import { z } from "zod";
import { DeepLinkType, getDeepLink } from "../../helpers/get-deeplink.js";
import { ensureError } from "../../helpers/ensure-error.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import {
  bankAccountDetailsSchema,
  batchPaymentsSchema,
  formatContactBankDetails,
} from "../../helpers/contact-bank-details.js";

const CreateContactTool = CreateXeroTool(
  "create-contact",
  "Create a contact in Xero. Supply batchPayments to set up a supplier that can be paid \
in a batch payment straight away.\
  When a contact is created, a deep link to the contact in Xero is returned. \
  This deep link can be used to view the contact in Xero directly. \
  This link should be displayed to the user.",
  {
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    bankAccountDetails: bankAccountDetailsSchema,
    batchPayments: batchPaymentsSchema,
  },
  async ({ name, email, phone, bankAccountDetails, batchPayments }) => {
    try {
      const response = await createXeroContact({
        name,
        email,
        phone,
        bankAccountDetails,
        batchPayments,
      });
      if (response.isError) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating contact: ${response.error}`,
            },
          ],
        };
      }

      const contact = response.result;

      const deepLink = contact.contactID
        ? await getDeepLink(DeepLinkType.CONTACT, contact.contactID)
        : null;

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Contact created: ${contact.name} (ID: ${contact.contactID})`,
              ...(bankAccountDetails !== undefined || batchPayments !== undefined
                ? formatContactBankDetails(contact)
                : []),
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
            text: `Error creating contact: ${err.message}`,
          },
        ],
      };
    }
  },
);

export default CreateContactTool;
