import { z } from "zod";

import { getXeroPayrollPayslip } from "../../handlers/get-xero-payroll-payslip.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

const line = (label: string, value: unknown): string | null =>
  value === undefined || value === null ? null : `  ${label}: ${value}`;

const GetPayrollPayslipTool = CreateXeroTool(
  "get-payroll-payslip",
  "Get a single Australian payslip in full: earnings, deductions, tax and superannuation \
lines with their totals. This is the detail needed to build a gross-up journal. \
Remember that any journal you derive from this must use the account codes of the \
DESTINATION organisation, which are not the same as this organisation's.",
  {
    payslipID: z.string().describe("The Xero identifier of the payslip"),
  },
  async ({ payslipID }) => {
    const response = await getXeroPayrollPayslip(payslipID);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching payslip: ${response.error}`,
          },
        ],
      };
    }

    const payslip = response.result;

    const section = <T,>(
      title: string,
      lines: T[] | undefined,
      render: (item: T) => (string | null)[],
    ): string | null => {
      if (!lines?.length) return null;
      return [
        `${title}:`,
        ...lines.map((item) => render(item).filter(Boolean).join("\n")),
      ].join("\n");
    };

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Payslip ${payslip.payslipID}`,
            `Employee: ${`${payslip.firstName ?? ""} ${payslip.lastName ?? ""}`.trim()} (${payslip.employeeID})`,
            "",
            "Totals:",
            line("Wages", payslip.wages),
            line("Deductions", payslip.deductions),
            line("Tax", payslip.tax),
            line("Reimbursements", payslip.reimbursements),
            line("Net pay", payslip.netPay),
            "",
            section("Earnings lines", payslip.earningsLines, (item) => [
              line("Rate ID", item.earningsRateID),
              line("Amount", item.amount),
              line("Units", item.numberOfUnits),
            ]),
            section("Leave earnings lines", payslip.leaveEarningsLines, (item) => [
              line("Rate ID", item.earningsRateID),
              line("Rate per unit", item.ratePerUnit),
              line("Units", item.numberOfUnits),
            ]),
            section("Deduction lines", payslip.deductionLines, (item) => [
              line("Type ID", item.deductionTypeID),
              line("Amount", item.amount),
            ]),
            section("Tax lines", payslip.taxLines, (item) => [
              line("Type", item.taxTypeName ?? item.description),
              line("Amount", item.amount),
            ]),
            // The account codes here belong to THIS organisation. They are a
            // useful reference for what the payroll posts to locally, but must
            // not be reused when journalling into a different organisation.
            section("Superannuation lines", payslip.superannuationLines, (item) => [
              line("Contribution", item.contributionType),
              line("Calculation", item.calculationType),
              line("Amount", item.amount),
              line("Expense account (this org)", item.expenseAccountCode),
              line("Liability account (this org)", item.liabilityAccountCode),
            ]),
          ]
            .filter((entry) => entry !== null)
            .join("\n"),
        },
      ],
    };
  },
);

export default GetPayrollPayslipTool;
