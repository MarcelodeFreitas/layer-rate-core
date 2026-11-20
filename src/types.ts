export type CurrencyAmount = number;

export type MassUnit = "g" | "kg";

export type FeeBehavior = "recover" | "addOnTop";

export type PricingMode = "markup" | "margin";

export type TaxBasis = "salePrice" | "salePricePlusAddOnTopFees";

export type AddOnTopFeePercentBasis = "preTaxCustomerPrice" | "finalCustomerPrice";

export interface AmountWithMassUnit {
  value: number;
  unit: MassUnit;
}

export interface MaterialInput {
  name?: string;
  amount: AmountWithMassUnit;
  costPer: AmountWithMassUnit;
}

export interface DurationInput {
  hours?: number;
  minutes?: number;
}

export interface PricingInput {
  mode: PricingMode;
  percent: number;
}

export interface PricingOptionsInput {
  taxBasis?: TaxBasis;
  addOnTopFeePercentBasis?: AddOnTopFeePercentBasis;
}

export interface FeeInput {
  name: string;
  fixedAmount?: CurrencyAmount;
  percent?: number;
  behavior: FeeBehavior;
}

export interface LayerRateQuoteInput {
  designCost: CurrencyAmount;
  materials: MaterialInput[];
  printTime: DurationInput;
  printerPurchasePrice: CurrencyAmount;
  printerPowerWatts: number;
  electricityCostPerKwh: CurrencyAmount;
  printerLifetimeYears: number;
  typicalUsageHoursPerDay: number;
  repairRatioPercent: number;
  laborCostPerHour: CurrencyAmount;
  setupTime: DurationInput;
  operationsTime: DurationInput;
  postProcessingTime: DurationInput;
  failRatioPercent: number;
  componentCost: CurrencyAmount;
  pricing: PricingInput;
  pricingOptions?: PricingOptionsInput;
  quantity: number;
  taxPercent?: number;
  fees?: FeeInput[];
}

export interface MaterialCostBreakdown {
  name?: string;
  amountGrams: number;
  cost: CurrencyAmount;
}

export interface FeeCostBreakdown {
  name: string;
  behavior: FeeBehavior;
  fixedAmount: CurrencyAmount;
  percent: number;
  amount: CurrencyAmount;
}

export interface QuoteCostBreakdown {
  material: CurrencyAmount;
  printerPower: CurrencyAmount;
  runtime: CurrencyAmount;
  operations: CurrencyAmount;
  postProcessing: CurrencyAmount;
  failedJobSurcharge: CurrencyAmount;
  machineMaintenanceSurcharge: CurrencyAmount;
  design: CurrencyAmount;
  setup: CurrencyAmount;
  components: CurrencyAmount;
}

export interface QuoteFeesBreakdown {
  recoverable: FeeCostBreakdown[];
  addOnTop: FeeCostBreakdown[];
}

export interface LayerRateQuoteResult {
  perJobCustomerPrice: CurrencyAmount;
  baseCustomerPriceAllJobs: CurrencyAmount;
  customerPriceAllJobs: CurrencyAmount;
  productionCostAllJobs: CurrencyAmount;
  totalCostPerJob: CurrencyAmount;
  recoverableFees: CurrencyAmount;
  addOnTopFees: CurrencyAmount;
  tax: CurrencyAmount;
  sellerReceivesAllJobs: CurrencyAmount;
  totalProfitAllJobs: CurrencyAmount;
  perJob: QuoteCostBreakdown;
  allJobs: QuoteCostBreakdown;
  materials: MaterialCostBreakdown[];
  fees: QuoteFeesBreakdown;
  printerLifetimeHours: number;
  printHours: number;
}
