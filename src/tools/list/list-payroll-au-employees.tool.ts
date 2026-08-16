import { z } from "zod";

import { listXeroPayrollAuEmployees } from "../../handlers/list-xero-payroll-au-employees.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

/**
 * Australian replacement for the stock NZ employees tool.
 *
 * Takes the `list-payroll-employees` name because the NZ tool it supersedes is
 * de-registered — its endpoints cannot serve an Australian organisation. The
 * upstream NZ file is left untouched so it can be re-registered if an NZ
 * organisation is ever connected.
 */
const ListPayrollAuEmployeesTool = CreateXeroTool(
  "list-payroll-employees",
  "List employees in an organisation's Australian payroll.",
  {
    page: z
      .number()
      .optional()
      .describe("Optional page number for paging through employees, defaults to 1"),
  },
  async ({ page }) => {
    const response = await listXeroPayrollAuEmployees(page ?? 1);

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing employees: ${response.error}`,
          },
        ],
      };
    }

    const employees = response.result ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${employees.length} employee${employees.length === 1 ? "" : "s"}:`,
        },
        ...employees.map((employee) => ({
          type: "text" as const,
          text: [
            `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim(),
            `  Employee ID: ${employee.employeeID}`,
            employee.status ? `  Status: ${employee.status}` : null,
            employee.startDate ? `  Start date: ${employee.startDate}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default ListPayrollAuEmployeesTool;
