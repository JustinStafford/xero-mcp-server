import GetAssetTool from "./get-asset.tool.js";
import GetInvoiceAttachmentTool from "./get-invoice-attachment.tool.js";
import GetPayrollPayRunTool from "./get-payroll-pay-run.tool.js";
import GetPayrollPayslipTool from "./get-payroll-payslip.tool.js";

// GetPayrollTimesheetTool (NZ) is de-registered — see src/tools/list/index.ts.
export const GetTools = [
  GetAssetTool,
  GetInvoiceAttachmentTool,
  GetPayrollPayRunTool,
  GetPayrollPayslipTool,
];
