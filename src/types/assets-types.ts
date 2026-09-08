// Import shim for the Assets API models, which xero-node does not re-export
// from its package root. Mirrors src/types/payroll-au-types.ts.
//
// Setting and Pagination are aliased: both names are too generic to import
// unqualified alongside the accounting models.
export { Asset } from "xero-node/dist/gen/model/assets/asset.js";
export { AssetType } from "xero-node/dist/gen/model/assets/assetType.js";
export { AssetStatus } from "xero-node/dist/gen/model/assets/assetStatus.js";
export { AssetStatusQueryParam } from "xero-node/dist/gen/model/assets/assetStatusQueryParam.js";
export { BookDepreciationSetting } from "xero-node/dist/gen/model/assets/bookDepreciationSetting.js";
export { BookDepreciationDetail } from "xero-node/dist/gen/model/assets/bookDepreciationDetail.js";
export { Setting as AssetSetting } from "xero-node/dist/gen/model/assets/setting.js";
export { Pagination as AssetPagination } from "xero-node/dist/gen/model/assets/pagination.js";
