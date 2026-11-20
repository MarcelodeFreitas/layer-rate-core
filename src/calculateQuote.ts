import { LayerRateCalculationError } from "./errors.js";
import {
  durationToHours,
  massToGrams,
  percent,
  sumBreakdown,
  sumFees,
} from "./math.js";
import type {
  FeeCostBreakdown,
  FeeInput,
  LayerRateQuoteInput,
  LayerRateQuoteResult,
  MaterialCostBreakdown,
  MaterialInput,
  PricingOptionsInput,
  QuoteCostBreakdown,
} from "./types.js";
import { assertValidQuoteInput } from "./validation.js";

const DAYS_PER_YEAR = 365;
const WATTS_PER_KW = 1000;
const DEFAULT_PRICING_OPTIONS: Required<PricingOptionsInput> = {
  taxBasis: "salePrice",
  addOnTopFeePercentBasis: "preTaxCustomerPrice",
};

export function calculateQuote(input: LayerRateQuoteInput): LayerRateQuoteResult {
  assertValidQuoteInput(input);

  const quantity = input.quantity;
  const printHours = durationToHours(input.printTime);
  const setupHours = durationToHours(input.setupTime);
  const operationsHours = durationToHours(input.operationsTime);
  const postProcessingHours = durationToHours(input.postProcessingTime);
  const printerLifetimeHours =
    input.printerLifetimeYears * DAYS_PER_YEAR * input.typicalUsageHoursPerDay;

  const materials = input.materials.map(calculateMaterialCost);
  const materialCostPerJob = materials.reduce((sum, material) => sum + material.cost, 0);

  const printerPowerCostPerJob =
    (input.printerPowerWatts / WATTS_PER_KW) *
    printHours *
    input.electricityCostPerKwh;

  const runtimeCostPerJob =
    (input.printerPurchasePrice / printerLifetimeHours) * printHours;

  const machineMaintenanceSurchargePerJob =
    ((input.printerPurchasePrice * percent(input.repairRatioPercent)) /
      printerLifetimeHours) *
    printHours;

  const setupCostOnce = setupHours * input.laborCostPerHour;
  const operationsCostPerJob = operationsHours * input.laborCostPerHour;
  const postProcessingCostPerJob = postProcessingHours * input.laborCostPerHour;

  const failedJobSurchargePerJob =
    percent(input.failRatioPercent) *
    (materialCostPerJob +
      printerPowerCostPerJob +
      runtimeCostPerJob +
      operationsCostPerJob);

  const perJob: QuoteCostBreakdown = {
    material: materialCostPerJob,
    printerPower: printerPowerCostPerJob,
    runtime: runtimeCostPerJob,
    operations: operationsCostPerJob,
    postProcessing: postProcessingCostPerJob,
    failedJobSurcharge: failedJobSurchargePerJob,
    machineMaintenanceSurcharge: machineMaintenanceSurchargePerJob,
    design: input.designCost / quantity,
    setup: setupCostOnce / quantity,
    components: input.componentCost,
  };

  const allJobs: QuoteCostBreakdown = {
    material: materialCostPerJob * quantity,
    printerPower: printerPowerCostPerJob * quantity,
    runtime: runtimeCostPerJob * quantity,
    operations: operationsCostPerJob * quantity,
    postProcessing: postProcessingCostPerJob * quantity,
    failedJobSurcharge: failedJobSurchargePerJob * quantity,
    machineMaintenanceSurcharge: machineMaintenanceSurchargePerJob * quantity,
    design: input.designCost,
    setup: setupCostOnce,
    components: input.componentCost * quantity,
  };

  const productionCostAllJobs = sumBreakdown(allJobs);
  const baseCustomerPriceAllJobs = calculateBasePrice(
    productionCostAllJobs,
    input.pricing,
  );
  const feeBreakdown = calculateFees(input.fees ?? [], baseCustomerPriceAllJobs);
  const recoverableFees = sumFees(feeBreakdown.recoverable);
  const salePriceAllJobs = baseCustomerPriceAllJobs + recoverableFees;
  const pricingOptions = normalizePricingOptions(input.pricingOptions);
  const taxPercent = percent(input.taxPercent ?? 0);
  const customerCharge = calculateCustomerCharge(
    input.fees ?? [],
    salePriceAllJobs,
    taxPercent,
    pricingOptions,
  );
  const addOnTopFeeBreakdown = customerCharge.addOnTopFeeBreakdown;
  const addOnTopFees = customerCharge.addOnTopFees;
  const fees = {
    recoverable: feeBreakdown.recoverable,
    addOnTop: addOnTopFeeBreakdown,
  };
  const tax = customerCharge.tax;
  const customerPriceAllJobs = salePriceAllJobs + addOnTopFees + tax;
  const sellerReceivesAllJobs = salePriceAllJobs - recoverableFees;
  const totalProfitAllJobs = sellerReceivesAllJobs - productionCostAllJobs;
  const perJobCustomerPrice = customerPriceAllJobs / quantity;

  validateOutput({
    perJobCustomerPrice,
    baseCustomerPriceAllJobs,
    customerPriceAllJobs,
    productionCostAllJobs,
    recoverableFees,
    addOnTopFees,
    tax,
    sellerReceivesAllJobs,
    totalProfitAllJobs,
  });

  return {
    perJobCustomerPrice,
    baseCustomerPriceAllJobs,
    customerPriceAllJobs,
    productionCostAllJobs,
    totalCostPerJob: productionCostAllJobs / quantity,
    recoverableFees,
    addOnTopFees,
    tax,
    sellerReceivesAllJobs,
    totalProfitAllJobs,
    perJob,
    allJobs,
    materials,
    fees,
    printerLifetimeHours,
    printHours,
  };
}

function calculateBasePrice(
  productionCostAllJobs: number,
  pricing: LayerRateQuoteInput["pricing"],
): number {
  if (pricing.mode === "markup") {
    return productionCostAllJobs * (1 + percent(pricing.percent));
  }

  return productionCostAllJobs / (1 - percent(pricing.percent));
}

function calculateFees(
  fees: FeeInput[],
  baseCustomerPriceAllJobs: number,
): LayerRateQuoteResult["fees"] {
  return {
    recoverable: calculateRecoverableFees(fees, baseCustomerPriceAllJobs),
    addOnTop: [],
  };
}

function calculateRecoverableFees(
  fees: FeeInput[],
  baseCustomerPriceAllJobs: number,
): FeeCostBreakdown[] {
  const recoverableFees = fees.filter((fee) => fee.behavior === "recover");
  const totalFixedAmount = recoverableFees.reduce(
    (sum, fee) => sum + (fee.fixedAmount ?? 0),
    0,
  );
  const totalPercent = recoverableFees.reduce(
    (sum, fee) => sum + percent(fee.percent ?? 0),
    0,
  );
  const salePriceAllJobs =
    totalPercent === 0
      ? baseCustomerPriceAllJobs + totalFixedAmount
      : (baseCustomerPriceAllJobs + totalFixedAmount) / (1 - totalPercent);

  return recoverableFees.map((fee) => toFeeBreakdown(fee, salePriceAllJobs));
}

function calculateAddOnTopFees(
  fees: FeeInput[],
  basisAmount: number,
): FeeCostBreakdown[] {
  const addOnTopFees = fees.filter((fee) => fee.behavior === "addOnTop");
  return addOnTopFees.map((fee) => toFeeBreakdown(fee, basisAmount));
}

function calculateCustomerCharge(
  fees: FeeInput[],
  salePriceAllJobs: number,
  taxPercent: number,
  pricingOptions: Required<PricingOptionsInput>,
): {
  addOnTopFeeBreakdown: FeeCostBreakdown[];
  addOnTopFees: number;
  tax: number;
} {
  const addOnTopFees = fees.filter((fee) => fee.behavior === "addOnTop");
  const totalFixedAmount = addOnTopFees.reduce(
    (sum, fee) => sum + (fee.fixedAmount ?? 0),
    0,
  );
  const totalPercent = addOnTopFees.reduce(
    (sum, fee) => sum + percent(fee.percent ?? 0),
    0,
  );
  const taxIncludesAddOnTopFees = pricingOptions.taxBasis === "salePricePlusAddOnTopFees";
  const addOnPercentUsesFinalCustomerPrice =
    pricingOptions.addOnTopFeePercentBasis === "finalCustomerPrice";

  let addOnTopFeeBasis: number;

  if (addOnPercentUsesFinalCustomerPrice) {
    const taxFactor = taxIncludesAddOnTopFees ? 1 + taxPercent : 1;
    const denominator = 1 - totalPercent * taxFactor;

    if (denominator <= 0) {
      throw new LayerRateCalculationError(
        "addOnTop fee percentages are too high for final customer price basis.",
        { denominator },
      );
    }

    const addOnTopFeeAmount =
      (totalFixedAmount + totalPercent * salePriceAllJobs * taxFactor) /
      denominator;
    const taxBasis = taxIncludesAddOnTopFees
      ? salePriceAllJobs + addOnTopFeeAmount
      : salePriceAllJobs;
    const tax = taxBasis * taxPercent;
    addOnTopFeeBasis = salePriceAllJobs + addOnTopFeeAmount + tax;
  } else {
    const denominator = 1 - totalPercent;
    const addOnTopFeeAmount =
      totalPercent === 0
        ? totalFixedAmount
        : (totalFixedAmount + totalPercent * salePriceAllJobs) / denominator;
    addOnTopFeeBasis = salePriceAllJobs + addOnTopFeeAmount;
  }

  const addOnTopFeeBreakdown = calculateAddOnTopFees(fees, addOnTopFeeBasis);
  const addOnTopFeeAmount = sumFees(addOnTopFeeBreakdown);
  const taxBasis = taxIncludesAddOnTopFees
    ? salePriceAllJobs + addOnTopFeeAmount
    : salePriceAllJobs;

  return {
    addOnTopFeeBreakdown,
    addOnTopFees: addOnTopFeeAmount,
    tax: taxBasis * taxPercent,
  };
}

function toFeeBreakdown(fee: FeeInput, basisAmount: number): FeeCostBreakdown {
  const fixedAmount = fee.fixedAmount ?? 0;
  const feePercent = fee.percent ?? 0;

  return {
    name: fee.name,
    behavior: fee.behavior,
    fixedAmount,
    percent: feePercent,
    amount: fixedAmount + basisAmount * percent(feePercent),
  };
}

function calculateMaterialCost(material: MaterialInput): MaterialCostBreakdown {
  const amountGrams = massToGrams(material.amount);
  const costPerGram = material.costPer.value / massToGrams({
    value: 1,
    unit: material.costPer.unit,
  });

  return {
    name: material.name,
    amountGrams,
    cost: amountGrams * costPerGram,
  };
}

function normalizePricingOptions(
  pricingOptions: PricingOptionsInput | undefined,
): Required<PricingOptionsInput> {
  return {
    taxBasis: pricingOptions?.taxBasis ?? DEFAULT_PRICING_OPTIONS.taxBasis,
    addOnTopFeePercentBasis:
      pricingOptions?.addOnTopFeePercentBasis ??
      DEFAULT_PRICING_OPTIONS.addOnTopFeePercentBasis,
  };
}

function validateOutput(values: Record<string, number>): void {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) {
      throw new LayerRateCalculationError(`${name} must be finite.`, {
        name,
        value,
      });
    }
  }
}
