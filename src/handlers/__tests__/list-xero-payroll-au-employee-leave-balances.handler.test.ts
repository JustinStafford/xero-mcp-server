import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockXeroClientModule,
  payrollAUApi,
  resetMockXeroClient,
} from "../../test-support/mock-xero-client.js";
import { AuEmployee, AuEmployeeStatus } from "../../types/payroll-au-types.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const {
  listXeroPayrollAuEmployeeLeaveBalances,
  ABSOLUTE_MAX_EMPLOYEES,
  DEFAULT_MAX_EMPLOYEES,
} = await import("../list-xero-payroll-au-employee-leave-balances.handler.js");

const employee = (
  id: string,
  firstName: string,
  lastName: string,
): AuEmployee => ({
  employeeID: id,
  firstName,
  lastName,
  dateOfBirth: "1990-01-01",
  status: AuEmployeeStatus.ACTIVE,
  leaveBalances: [
    {
      leaveName: "Annual Leave",
      leaveTypeID: "lt-1",
      numberOfUnits: 76,
      typeOfUnits: "Hours",
    },
  ],
});

/** Serve `count` employees from the summary list endpoint, paged as Xero does. */
const givenPayroll = (employees: AuEmployee[]): void => {
  payrollAUApi.getEmployees.mockImplementation(
    async (
      _tenant: string,
      _ifModifiedSince: unknown,
      _where: unknown,
      _order: unknown,
      page: number,
    ) => ({
      body: {
        employees: employees.slice((page - 1) * 100, page * 100),
      },
    }),
  );

  payrollAUApi.getEmployee.mockImplementation(
    async (_tenant: string, id: string) => {
      const found = employees.find((e) => e.employeeID === id);
      return { body: { employees: found ? [found] : [] } };
    },
  );
};

const manyEmployees = (count: number): AuEmployee[] =>
  Array.from({ length: count }, (_, i) =>
    employee(`e-${i}`, `First${i}`, `Last${i}`),
  );

beforeEach(() => {
  resetMockXeroClient();
});

describe("listXeroPayrollAuEmployeeLeaveBalances", () => {
  it("returns one employee's balances in a single API call", async () => {
    givenPayroll([employee("e-1", "Lauren", "Smith")]);

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      employeeId: "e-1",
    });

    expect(response.isError).toBe(false);
    expect(response.result).toEqual([
      {
        employeeId: "e-1",
        name: "Lauren Smith",
        status: "ACTIVE",
        leaveBalances: [
          {
            leaveName: "Annual Leave",
            leaveTypeID: "lt-1",
            numberOfUnits: 76,
            typeOfUnits: "Hours",
          },
        ],
      },
    ]);
    expect(payrollAUApi.getEmployee).toHaveBeenCalledTimes(1);
    expect(payrollAUApi.getEmployees).not.toHaveBeenCalled();
  });

  it("refuses a query with no employee and no allEmployees flag", async () => {
    // An unbounded default would silently walk the whole payroll.
    const response = await listXeroPayrollAuEmployeeLeaveBalances({});

    expect(response.isError).toBe(true);
    expect(response.error).toContain("employeeName");
    expect(payrollAUApi.getEmployees).not.toHaveBeenCalled();
  });

  it("finds an employee by partial name, case-insensitively", async () => {
    givenPayroll([
      employee("e-1", "Lauren", "Smith"),
      employee("e-2", "Peter", "Jones"),
    ]);

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      employeeName: "lauren",
    });

    expect(response.result?.map((r) => r.name)).toEqual(["Lauren Smith"]);
    expect(payrollAUApi.getEmployee).toHaveBeenCalledTimes(1);
  });

  it("explains that a name matched nobody", async () => {
    givenPayroll([employee("e-1", "Lauren", "Smith")]);

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      employeeName: "Nobody",
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("Nobody");
  });

  it("stops before the rate limit when too many employees match", async () => {
    // Australian payroll has no leave-balance endpoint: balances come on the
    // full employee record, one call each, against Xero's 60-a-minute limit.
    givenPayroll(manyEmployees(DEFAULT_MAX_EMPLOYEES + 1));

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      allEmployees: true,
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain(String(DEFAULT_MAX_EMPLOYEES));
    expect(payrollAUApi.getEmployee).not.toHaveBeenCalled();
  });

  it("retrieves the whole payroll when it is within the default cap", async () => {
    givenPayroll(manyEmployees(DEFAULT_MAX_EMPLOYEES));

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      allEmployees: true,
    });

    expect(response.isError).toBe(false);
    expect(response.result).toHaveLength(DEFAULT_MAX_EMPLOYEES);
    expect(payrollAUApi.getEmployee).toHaveBeenCalledTimes(
      DEFAULT_MAX_EMPLOYEES,
    );
  });

  it("honours a raised cap", async () => {
    givenPayroll(manyEmployees(DEFAULT_MAX_EMPLOYEES + 5));

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      allEmployees: true,
      maxEmployees: DEFAULT_MAX_EMPLOYEES + 5,
    });

    expect(response.isError).toBe(false);
    expect(response.result).toHaveLength(DEFAULT_MAX_EMPLOYEES + 5);
  });

  it("will not let the caller raise the cap past the absolute ceiling", async () => {
    givenPayroll(manyEmployees(ABSOLUTE_MAX_EMPLOYEES + 1));

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      allEmployees: true,
      maxEmployees: 10_000,
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain(String(ABSOLUTE_MAX_EMPLOYEES));
    expect(payrollAUApi.getEmployee).not.toHaveBeenCalled();
  });

  it("reads employees one at a time rather than in a parallel burst", async () => {
    // A parallel burst is what trips Xero's per-minute limit.
    givenPayroll(manyEmployees(5));
    let inFlight = 0;
    let maxInFlight = 0;
    payrollAUApi.getEmployee.mockImplementation(async (_t: string, id: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return { body: { employees: [employee(id, "A", "B")] } };
    });

    await listXeroPayrollAuEmployeeLeaveBalances({ allEmployees: true });

    expect(maxInFlight).toBe(1);
  });

  it("pages through a payroll larger than one page", async () => {
    givenPayroll(manyEmployees(120));

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      employeeName: "Last119",
    });

    expect(payrollAUApi.getEmployees).toHaveBeenCalledTimes(2);
    expect(response.result?.map((r) => r.name)).toEqual(["First119 Last119"]);
  });

  it("names the missing employee when the ID is unknown", async () => {
    givenPayroll([]);

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      employeeId: "e-missing",
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("e-missing");
  });

  it("reports an employee with no leave on file as an empty list", async () => {
    givenPayroll([{ ...employee("e-1", "Lauren", "Smith"), leaveBalances: undefined }]);

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      employeeId: "e-1",
    });

    expect(response.isError).toBe(false);
    expect(response.result?.[0].leaveBalances).toEqual([]);
  });

  it("says so when the payroll is empty", async () => {
    givenPayroll([]);

    const response = await listXeroPayrollAuEmployeeLeaveBalances({
      allEmployees: true,
    });

    expect(response.isError).toBe(true);
    expect(response.error).toContain("no employees");
  });
});
