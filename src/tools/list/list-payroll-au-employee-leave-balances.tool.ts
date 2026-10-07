import { z } from "zod";

import {
  ABSOLUTE_MAX_EMPLOYEES,
  DEFAULT_MAX_EMPLOYEES,
  listXeroPayrollAuEmployeeLeaveBalances,
} from "../../handlers/list-xero-payroll-au-employee-leave-balances.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

/**
 * Australian replacement for the stock NZ leave-balance tool.
 *
 * Takes the `list-payroll-employee-leave-balances` name because the NZ tool it
 * supersedes is de-registered — see src/tools/list/index.ts.
 */
const ListPayrollAuEmployeeLeaveBalancesTool = CreateXeroTool(
  "list-payroll-employee-leave-balances",
  "Get employee leave balances from an organisation's Australian payroll — annual leave, \
personal/carer's leave and any other leave type set up in payroll. \
Name one employee with employeeId or employeeName. Retrieving the whole payroll needs \
allEmployees set to true, because each employee costs a separate API call.",
  {
    employeeId: z
      .string()
      .optional()
      .describe(
        "The Xero payroll employee ID. The fastest option — one API call. Use \
list-payroll-employees to find it.",
      ),
    employeeName: z
      .string()
      .optional()
      .describe(
        "Part or all of an employee's name, matched case-insensitively against their \
full name. Use this when the employee ID is not known.",
      ),
    allEmployees: z
      .boolean()
      .optional()
      .describe(
        "Set true to retrieve balances for every employee in the payroll. Only use this \
when the user has asked for everyone.",
      ),
    maxEmployees: z
      .number()
      .optional()
      .describe(
        `Safety limit on how many employees one call will retrieve. Defaults to \
${DEFAULT_MAX_EMPLOYEES}, maximum ${ABSOLUTE_MAX_EMPLOYEES}.`,
      ),
  },
  async ({ employeeId, employeeName, allEmployees, maxEmployees }) => {
    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      employeeId,
      employeeName,
      allEmployees,
      maxEmployees,
    });

    if (response.isError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting leave balances: ${response.error}`,
          },
        ],
      };
    }

    const employees = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Leave balances for ${employees.length} employee${employees.length === 1 ? "" : "s"}:`,
        },
        ...employees.map((employee) => ({
          type: "text" as const,
          text: [
            employee.name,
            `  Employee ID: ${employee.employeeId}`,
            employee.status ? `  Status: ${employee.status}` : null,
            employee.leaveBalances.length === 0
              ? "  No leave balances on this employee's record."
              : null,
            ...employee.leaveBalances.map(
              (balance) =>
                `  ${balance.leaveName ?? "Unnamed leave type"}: ` +
                `${balance.numberOfUnits ?? 0} ${balance.typeOfUnits ?? "units"}`,
            ),
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      ],
    };
  },
);

export default ListPayrollAuEmployeeLeaveBalancesTool;
