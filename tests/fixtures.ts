import type { LayerRateQuoteInput } from "../src/index.js";

export function quoteInput(
  overrides: Partial<LayerRateQuoteInput> = {},
): LayerRateQuoteInput {
  return {
    designCost: 12,
    materials: [
      {
        name: "PLA",
        amount: { value: 80, unit: "g" },
        costPer: { value: 25, unit: "kg" },
      },
    ],
    printTime: { hours: 3 },
    printerPurchasePrice: 600,
    printerPowerWatts: 200,
    electricityCostPerKwh: 1,
    printerLifetimeYears: 4,
    typicalUsageHoursPerDay: 5,
    repairRatioPercent: 30,
    laborCostPerHour: 20,
    setupTime: { minutes: 6 },
    operationsTime: { minutes: 9 },
    postProcessingTime: { minutes: 12 },
    failRatioPercent: 15,
    componentCost: 3,
    pricing: { mode: "markup", percent: 80 },
    quantity: 3,
    ...overrides,
  };
}
