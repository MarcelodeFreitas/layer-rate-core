import type {
  AmountWithMassUnit,
  DurationInput,
  FeeCostBreakdown,
  FeeInput,
  LayerRateQuoteInput,
  LayerRateQuoteResult,
  MaterialCostBreakdown,
  MaterialInput,
  QuoteCostBreakdown,
} from "./types.js";

const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;
const MINUTES_PER_HOUR = 60;
const GRAMS_PER_KG = 1000;
const WATTS_PER_KW = 1000;

export function calculateQuote(input: LayerRateQuoteInput): LayerRateQuoteResult {
  validateInput(input);

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
  const addOnTopFeeBreakdown = calculateAddOnTopFees(input.fees ?? [], salePriceAllJobs);
  const addOnTopFees = sumFees(addOnTopFeeBreakdown);
  const fees = {
    recoverable: feeBreakdown.recoverable,
    addOnTop: addOnTopFeeBreakdown,
  };
  const tax = salePriceAllJobs * percent(input.taxPercent ?? 0);
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
  salePriceAllJobs: number,
): FeeCostBreakdown[] {
  const addOnTopFees = fees.filter((fee) => fee.behavior === "addOnTop");
  const totalFixedAmount = addOnTopFees.reduce(
    (sum, fee) => sum + (fee.fixedAmount ?? 0),
    0,
  );
  const totalPercent = addOnTopFees.reduce(
    (sum, fee) => sum + percent(fee.percent ?? 0),
    0,
  );
  const customerPriceBeforeTax =
    totalPercent === 0
      ? salePriceAllJobs + totalFixedAmount
      : (salePriceAllJobs + totalFixedAmount) / (1 - totalPercent);

  return addOnTopFees.map((fee) => toFeeBreakdown(fee, customerPriceBeforeTax));
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
  const costPerGram = material.costPer.value / massToGrams({ value: 1, unit: material.costPer.unit });

  return {
    name: material.name,
    amountGrams,
    cost: amountGrams * costPerGram,
  };
}

function massToGrams(amount: AmountWithMassUnit): number {
  if (amount.unit === "kg") {
    return amount.value * GRAMS_PER_KG;
  }

  return amount.value;
}

function durationToHours(duration: DurationInput): number {
  return (duration.hours ?? 0) + (duration.minutes ?? 0) / MINUTES_PER_HOUR;
}

function percent(value: number): number {
  return value / 100;
}

function sumBreakdown(breakdown: QuoteCostBreakdown): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

function sumFees(fees: FeeCostBreakdown[]): number {
  return fees.reduce((sum, fee) => sum + fee.amount, 0);
}

function validateInput(input: LayerRateQuoteInput): void {
  validateNonNegativeFinite("designCost", input.designCost);
  validateMaterials(input.materials);
  validateDuration("printTime", input.printTime);
  validateNonNegativeFinite("printerPurchasePrice", input.printerPurchasePrice);
  validateNonNegativeFinite("printerPowerWatts", input.printerPowerWatts);
  validateNonNegativeFinite("electricityCostPerKwh", input.electricityCostPerKwh);
  validateNonNegativeFinite("printerLifetimeYears", input.printerLifetimeYears);
  validateNonNegativeFinite("typicalUsageHoursPerDay", input.typicalUsageHoursPerDay);
  validateNonNegativeFinite("repairRatioPercent", input.repairRatioPercent);
  validateNonNegativeFinite("laborCostPerHour", input.laborCostPerHour);
  validateDuration("setupTime", input.setupTime);
  validateDuration("operationsTime", input.operationsTime);
  validateDuration("postProcessingTime", input.postProcessingTime);
  validateNonNegativeFinite("failRatioPercent", input.failRatioPercent);
  validateNonNegativeFinite("componentCost", input.componentCost);
  validatePricing(input.pricing);
  validateNonNegativeFinite("quantity", input.quantity);

  if (input.taxPercent !== undefined) {
    validateNonNegativeFinite("taxPercent", input.taxPercent);
  }

  validateFees(input.fees ?? []);

  if (input.typicalUsageHoursPerDay <= 0) {
    throw new Error("typicalUsageHoursPerDay must be greater than 0.");
  }

  if (input.typicalUsageHoursPerDay > HOURS_PER_DAY) {
    throw new Error("typicalUsageHoursPerDay cannot exceed 24.");
  }

  if (input.printerLifetimeYears <= 0) {
    throw new Error("printerLifetimeYears must be greater than 0.");
  }

  if (input.failRatioPercent > 100) {
    throw new Error("failRatioPercent cannot exceed 100.");
  }

  if (input.quantity < 1 || !Number.isInteger(input.quantity)) {
    throw new Error("quantity must be a positive integer.");
  }
}

function validateMaterials(materials: MaterialInput[]): void {
  if (!Array.isArray(materials) || materials.length === 0) {
    throw new Error("materials must contain at least one material.");
  }

  materials.forEach((material, index) => {
    validateMassAmount(`materials[${index}].amount`, material.amount);
    validateMassAmount(`materials[${index}].costPer`, material.costPer);
  });
}

function validateMassAmount(name: string, amount: AmountWithMassUnit): void {
  validateNonNegativeFinite(`${name}.value`, amount.value);

  if (amount.unit !== "g" && amount.unit !== "kg") {
    throw new Error(`${name}.unit must be "g" or "kg".`);
  }
}

function validateDuration(name: string, duration: DurationInput): void {
  const hasHours = duration.hours !== undefined;
  const hasMinutes = duration.minutes !== undefined;

  if (!hasHours && !hasMinutes) {
    throw new Error(`${name} must include hours, minutes, or both.`);
  }

  if (hasHours) {
    validateNonNegativeFinite(`${name}.hours`, duration.hours ?? 0);
  }

  if (hasMinutes) {
    validateNonNegativeFinite(`${name}.minutes`, duration.minutes ?? 0);
  }
}

function validatePricing(pricing: LayerRateQuoteInput["pricing"]): void {
  if (pricing.mode !== "markup" && pricing.mode !== "margin") {
    throw new Error('pricing.mode must be "markup" or "margin".');
  }

  validateNonNegativeFinite("pricing.percent", pricing.percent);

  if (pricing.mode === "margin" && pricing.percent >= 100) {
    throw new Error("pricing.percent must be less than 100 for margin pricing.");
  }
}

function validateFees(fees: FeeInput[]): void {
  fees.forEach((fee, index) => {
    if (fee.behavior !== "recover" && fee.behavior !== "addOnTop") {
      throw new Error(`fees[${index}].behavior must be "recover" or "addOnTop".`);
    }

    if (fee.fixedAmount !== undefined) {
      validateNonNegativeFinite(`fees[${index}].fixedAmount`, fee.fixedAmount);
    }

    if (fee.percent !== undefined) {
      validateNonNegativeFinite(`fees[${index}].percent`, fee.percent);
    }
  });

  validateFeePercentTotal(fees, "recover");
  validateFeePercentTotal(fees, "addOnTop");
}

function validateFeePercentTotal(
  fees: FeeInput[],
  behavior: FeeInput["behavior"],
): void {
  const totalPercent = fees
    .filter((fee) => fee.behavior === behavior)
    .reduce((sum, fee) => sum + (fee.percent ?? 0), 0);

  if (totalPercent >= 100) {
    throw new Error(`${behavior} fee percentages must total less than 100.`);
  }
}

function validateNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }

  if (value < 0) {
    throw new Error(`${name} cannot be negative.`);
  }
}

function validateOutput(values: Record<string, number>): void {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be finite.`);
    }
  }
}
