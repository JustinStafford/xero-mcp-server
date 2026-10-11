import { xeroClient } from "../clients/xero-client.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { AuEmployee, AuLeaveBalance } from "../types/payroll-au-types.js";
import { XeroClientResponse } from "../types/tool-response.js";

export interface EmployeeLeaveBalances {
  employeeId: string;
  name: string;
  status?: string;
  leaveBalances: AuLeaveBalance[];
}

export interface LeaveBalanceQuery {
  employeeId?: string;
  employeeName?: string;
  allEmployees?: boolean;
  maxEmployees?: number;
}

/**
 * Australian payroll has no leave-balance endpoint: balances come back attached
 * to the full employee record, which is one API call per employee. Xero allows
 * 60 calls a minute, so an unbounded "everyone's leave" would exhaust the limit
 * mid-conversation.
 */
export const DEFAULT_MAX_EMPLOYEES = 20;
export const ABSOLUTE_MAX_EMPLOYEES = 50;

const EMPLOYEES_PAGE_SIZE = 100;

const fullName = (employee: AuEmployee): string =>
  [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() ||
  employee.employeeID ||
  "(unnamed)";

async function getEmployeeDetail(employeeId: string): Promise<AuEmployee> {
  const response = await xeroClient.payrollAUApi.getEmployee(
    xeroClient.tenantId,
    employeeId,
    getClientHeaders(),
  );

  const employee = response.body.employees?.[0];
  if (!employee) {
    throw new Error(
      `No employee with ID ${employeeId} exists in this organisation's Australian payroll.`,
    );
  }
  return employee;
}

async function listAllEmployees(): Promise<AuEmployee[]> {
  const employees: AuEmployee[] = [];

  for (let page = 1; ; page += 1) {
    const response = await xeroClient.payrollAUApi.getEmployees(
      xeroClient.tenantId,
      undefined, // ifModifiedSince
      undefined, // where
      undefined, // order
      page,
      getClientHeaders(),
    );

    const batch = response.body.employees ?? [];
    employees.push(...batch);

    if (batch.length < EMPLOYEES_PAGE_SIZE) {
      return employees;
    }
  }
}

const toBalances = (employee: AuEmployee): EmployeeLeaveBalances => ({
  employeeId: employee.employeeID ?? "",
  name: fullName(employee),
  status: employee.status?.toString(),
  leaveBalances: employee.leaveBalances ?? [],
});

/**
 * Retrieve leave balances from an organisation's Australian payroll.
 */
export async function listXeroPayrollAuEmployeeLeaveBalances(
  query: LeaveBalanceQuery,
): Promise<XeroClientResponse<EmployeeLeaveBalances[]>> {
  try {
    await xeroClient.authenticate();

    if (query.employeeId) {
      const employee = await getEmployeeDetail(query.employeeId);
      return {
        result: [toBalances(employee)],
        isError: false,
        error: null,
      };
    }

    if (!query.employeeName && !query.allEmployees) {
      throw new Error(
        "Name an employee with employeeName, pass an employeeId, or set allEmployees " +
          "to true to retrieve the whole payroll.",
      );
    }

    const maxEmployees = Math.min(
      query.maxEmployees ?? DEFAULT_MAX_EMPLOYEES,
      ABSOLUTE_MAX_EMPLOYEES,
    );

    const all = await listAllEmployees();

    const needle = query.employeeName?.trim().toLowerCase();
    const matches = needle
      ? all.filter((employee) => fullName(employee).toLowerCase().includes(needle))
      : all;

    if (matches.length === 0) {
      throw new Error(
        needle
          ? `No employee in this organisation's Australian payroll matches "${query.employeeName}".`
          : "This organisation's Australian payroll has no employees.",
      );
    }

    if (matches.length > maxEmployees) {
      throw new Error(
        `${matches.length} employees match, which is above the limit of ${maxEmployees} ` +
          "for one call. Each employee costs a separate API call, so narrow the search or " +
          `raise maxEmployees (up to ${ABSOLUTE_MAX_EMPLOYEES}). Matches: ` +
          `${matches.map(fullName).join(", ")}.`,
      );
    }

    // Sequential on purpose: Xero's 60-calls-a-minute limit is per minute, and a
    // parallel burst is what trips it.
    const results: EmployeeLeaveBalances[] = [];
    for (const employee of matches) {
      if (!employee.employeeID) {
        continue;
      }
      results.push(toBalances(await getEmployeeDetail(employee.employeeID)));
    }

    return {
      result: results,
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
