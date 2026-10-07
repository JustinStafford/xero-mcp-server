import GetAssetTool from "./get-asset.tool.js";
import GetBankTransactionAttachmentTool from "./get-bank-transaction-attachment.tool.js";
import GetBatchPaymentTool from "./get-batch-payment.tool.js";
import GetInvoiceTool from "./get-invoice.tool.js";
import GetInvoiceAttachmentTool from "./get-invoice-attachment.tool.js";
import GetPayrollPayRunTool from "./get-payroll-pay-run.tool.js";
import GetPayrollPayslipTool from "./get-payroll-payslip.tool.js";

// GetPayrollTimesheetTool (NZ) is de-registered — see src/tools/list/index.ts.
export const GetTools = [
  GetAssetTool,
  GetInvoiceTool,
  GetInvoiceAttachmentTool,
  GetBankTransactionAttachmentTool,
  GetBatchPaymentTool,
  GetPayrollPayRunTool,
  GetPayrollPayslipTool,
];
