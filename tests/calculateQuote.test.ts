import { describe, expect, it } from "vitest";
import { calculateQuote } from "../src/index.js";
import type { LayerRateQuoteInput } from "../src/index.js";
import {
  LayerRateValidationError,
  parseQuoteInput,
  validateQuoteInput,
} from "../src/index.js";
import { quoteInput } from "./fixtures.js";

describe("calculateQuote", () => {
  it("matches a validated single-job reference example", () => {
    const quote = calculateQuote({
      designCost: 0,
      materials: [
        {
          amount: { value: 22, unit: "g" },
          costPer: { value: 15, unit: "kg" },
        },
      ],
      printTime: { hours: 1, minutes: 50 },
      printerPurchasePrice: 1000,
      printerPowerWatts: 350,
      electricityCostPerKwh: 0.2,
      printerLifetimeYears: 5,
      typicalUsageHoursPerDay: 3,
      repairRatioPercent: 20,
      laborCostPerHour: 10,
      setupTime: { minutes: 1 },
      operationsTime: { minutes: 1 },
      postProcessingTime: { minutes: 1 },
      failRatioPercent: 20,
      componentCost: 0,
      pricing: { mode: "markup", percent: 223 },
      quantity: 1,
    });

    expect(quote.printHours).toBeCloseTo(1.833333, 6);
    expect(quote.printerLifetimeHours).toBe(5475);
    expect(quote.perJob.material).toBeCloseTo(0.33, 2);
    expect(quote.perJob.printerPower).toBeCloseTo(0.13, 2);
    expect(quote.perJob.runtime).toBeCloseTo(0.33, 2);
    expect(quote.perJob.operations).toBeCloseTo(0.17, 2);
    expect(quote.perJob.postProcessing).toBeCloseTo(0.17, 2);
    expect(quote.perJob.failedJobSurcharge).toBeCloseTo(0.19, 2);
    expect(quote.perJob.machineMaintenanceSurcharge).toBeCloseTo(0.07, 2);
    expect(quote.perJob.design).toBeCloseTo(0, 2);
    expect(quote.perJob.setup).toBeCloseTo(0.17, 2);
    expect(quote.productionCostAllJobs).toBeCloseTo(1.55, 2);
    const perJobLines = Object.values(quote.perJob).reduce((sum, v) => sum + v, 0);
    expect(quote.totalCostPerJob).toBeCloseTo(perJobLines, 9);
    expect(quote.totalCostPerJob).toBeCloseTo(1.55, 2);
    expect(quote.totalProfitAllJobs).toBeCloseTo(3.46, 2);
    expect(quote.customerPriceAllJobs).toBeCloseTo(5.01, 2);
    expect(quote.perJobCustomerPrice).toBeCloseTo(5.01, 2);
  });

  it("supports material amount in grams priced per kilogram", () => {
    const quote = calculateQuote(
      quoteInput({
        materials: [
          {
            amount: { value: 22, unit: "g" },
            costPer: { value: 15, unit: "kg" },
          },
        ],
      }),
    );

    expect(quote.perJob.material).toBeCloseTo(0.33, 2);
    expect(quote.materials[0]?.amountGrams).toBe(22);
    expect(quote.materials[0]?.cost).toBeCloseTo(0.33, 2);
  });

  it("supports material amount in kilograms priced per kilogram", () => {
    const quote = calculateQuote(
      quoteInput({
        materials: [
          {
            amount: { value: 0.022, unit: "kg" },
            costPer: { value: 15, unit: "kg" },
          },
        ],
      }),
    );

    expect(quote.perJob.material).toBeCloseTo(0.33, 2);
    expect(quote.materials[0]?.amountGrams).toBe(22);
  });

  it("supports multiple materials with different prices", () => {
    const quote = calculateQuote(
      quoteInput({
        materials: [
          {
            name: "PLA Black",
            amount: { value: 20, unit: "g" },
            costPer: { value: 15, unit: "kg" },
          },
          {
            name: "Support",
            amount: { value: 5, unit: "g" },
            costPer: { value: 0.04, unit: "g" },
          },
        ],
      }),
    );

    expect(quote.materials).toHaveLength(2);
    expect(quote.materials[0]).toMatchObject({ name: "PLA Black" });
    expect(quote.materials[1]).toMatchObject({ name: "Support" });
    expect(quote.perJob.material).toBeCloseTo(0.5, 2);
  });

  it("supports time input as minutes only", () => {
    const quote = calculateQuote(quoteInput({ printTime: { minutes: 110 } }));

    expect(quote.printHours).toBeCloseTo(1.833333, 6);
  });

  it("supports time input as hours plus minutes", () => {
    const quote = calculateQuote(quoteInput({ printTime: { hours: 1, minutes: 50 } }));

    expect(quote.printHours).toBeCloseTo(1.833333, 6);
  });

  it("supports markup pricing", () => {
    const quote = calculateQuote(quoteInput({ pricing: { mode: "markup", percent: 100 } }));

    expect(quote.baseCustomerPriceAllJobs).toBeCloseTo(
      quote.productionCostAllJobs * 2,
      6,
    );
    expect(quote.totalProfitAllJobs).toBeCloseTo(quote.productionCostAllJobs, 6);
  });

  it("supports margin pricing", () => {
    const quote = calculateQuote(quoteInput({ pricing: { mode: "margin", percent: 50 } }));

    expect(quote.baseCustomerPriceAllJobs).toBeCloseTo(
      quote.productionCostAllJobs / 0.5,
      6,
    );
    expect(quote.totalProfitAllJobs).toBeCloseTo(quote.productionCostAllJobs, 6);
  });

  it("recovers percentage seller fees from the final sale price", () => {
    const quote = calculateQuote(
      quoteInput({
        pricing: { mode: "markup", percent: 0 },
        fees: [{ name: "Marketplace", percent: 10, behavior: "recover" }],
      }),
    );

    expect(quote.sellerReceivesAllJobs).toBeCloseTo(quote.baseCustomerPriceAllJobs, 6);
    expect(quote.recoverableFees).toBeCloseTo(quote.baseCustomerPriceAllJobs / 9, 6);
    expect(quote.totalProfitAllJobs).toBeCloseTo(0, 6);
  });

  it("recovers fixed seller fees", () => {
    const quote = calculateQuote(
      quoteInput({
        pricing: { mode: "markup", percent: 0 },
        fees: [{ name: "Fixed seller fee", fixedAmount: 2, behavior: "recover" }],
      }),
    );

    expect(quote.recoverableFees).toBeCloseTo(2, 6);
    expect(quote.sellerReceivesAllJobs).toBeCloseTo(quote.baseCustomerPriceAllJobs, 6);
  });

  it("adds percentage customer-paid fees on top", () => {
    const quote = calculateQuote(
      quoteInput({
        pricing: { mode: "markup", percent: 0 },
        fees: [{ name: "Customer fee", percent: 10, behavior: "addOnTop" }],
      }),
    );

    expect(quote.addOnTopFees).toBeCloseTo(quote.baseCustomerPriceAllJobs / 9, 6);
    expect(quote.customerPriceAllJobs).toBeCloseTo(
      quote.baseCustomerPriceAllJobs + quote.addOnTopFees,
      6,
    );
    expect(quote.sellerReceivesAllJobs).toBeCloseTo(quote.baseCustomerPriceAllJobs, 6);
  });

  it("adds fixed customer-paid fees on top", () => {
    const quote = calculateQuote(
      quoteInput({
        pricing: { mode: "markup", percent: 0 },
        fees: [{ name: "Fixed customer fee", fixedAmount: 2, behavior: "addOnTop" }],
      }),
    );

    expect(quote.addOnTopFees).toBeCloseTo(2, 6);
    expect(quote.customerPriceAllJobs).toBeCloseTo(
      quote.baseCustomerPriceAllJobs + 2,
      6,
    );
  });

  it("adds tax after price without counting tax as profit", () => {
    const quote = calculateQuote(
      quoteInput({
        pricing: { mode: "markup", percent: 0 },
        taxPercent: 20,
      }),
    );

    expect(quote.tax).toBeCloseTo(quote.baseCustomerPriceAllJobs * 0.2, 6);
    expect(quote.customerPriceAllJobs).toBeCloseTo(
      quote.baseCustomerPriceAllJobs + quote.tax,
      6,
    );
    expect(quote.totalProfitAllJobs).toBeCloseTo(0, 6);
  });

  it("can tax add-on customer fees when configured", () => {
    const quote = calculateQuote(
      quoteInput({
        pricing: { mode: "markup", percent: 0 },
        fees: [{ name: "Fixed customer fee", fixedAmount: 2, behavior: "addOnTop" }],
        taxPercent: 20,
        pricingOptions: { taxBasis: "salePricePlusAddOnTopFees" },
      }),
    );

    expect(quote.addOnTopFees).toBeCloseTo(2, 6);
    expect(quote.tax).toBeCloseTo((quote.baseCustomerPriceAllJobs + 2) * 0.2, 6);
    expect(quote.customerPriceAllJobs).toBeCloseTo(
      quote.baseCustomerPriceAllJobs + 2 + quote.tax,
      6,
    );
  });

  it("can calculate add-on percentage fees from the final customer price", () => {
    const quote = calculateQuote(
      quoteInput({
        pricing: { mode: "markup", percent: 0 },
        fees: [{ name: "Customer fee", percent: 10, behavior: "addOnTop" }],
        taxPercent: 20,
        pricingOptions: {
          taxBasis: "salePricePlusAddOnTopFees",
          addOnTopFeePercentBasis: "finalCustomerPrice",
        },
      }),
    );
    const expectedAddOnFees = (quote.baseCustomerPriceAllJobs * 0.1 * 1.2) / 0.88;

    expect(quote.addOnTopFees).toBeCloseTo(expectedAddOnFees, 6);
    expect(quote.tax).toBeCloseTo(
      (quote.baseCustomerPriceAllJobs + expectedAddOnFees) * 0.2,
      6,
    );
  });

  it("keeps failRatioPercent as a failed-cost surcharge ratio", () => {
    const quote = calculateQuote(
      quoteInput({
        failRatioPercent: 100,
      }),
    );
    const failedCostBasis =
      quote.perJob.material +
      quote.perJob.printerPower +
      quote.perJob.runtime +
      quote.perJob.operations;

    expect(quote.perJob.failedJobSurcharge).toBeCloseTo(failedCostBasis, 6);
  });

  it("rejects invalid units, empty materials, bad durations, bad margin percent, and bad fees", () => {
    expect(() =>
      calculateQuote(
        quoteInput({
          materials: [
            {
              amount: { value: 22, unit: "oz" },
              costPer: { value: 15, unit: "kg" },
            },
          ],
        } as unknown as Partial<LayerRateQuoteInput>),
      ),
    ).toThrow('materials[0].amount.unit must be "g" or "kg".');

    expect(() => calculateQuote(quoteInput({ materials: [] }))).toThrow(
      "materials must contain at least one material.",
    );

    expect(() => calculateQuote(quoteInput({ printTime: {} }))).toThrow(
      "printTime must include hours, minutes, or both.",
    );

    expect(() =>
      calculateQuote(quoteInput({ pricing: { mode: "margin", percent: 100 } })),
    ).toThrow("pricing.percent must be less than 100 for margin pricing.");

    expect(() =>
      calculateQuote(
        quoteInput({
          fees: [{ name: "Bad fee", fixedAmount: -1, behavior: "recover" }],
        }),
      ),
    ).toThrow("fees[0].fixedAmount cannot be negative.");

    expect(() =>
      calculateQuote(
        quoteInput({
          fees: [{ name: "Bad percent", percent: 100, behavior: "recover" }],
        }),
      ),
    ).toThrow("recover fee percentages must total less than 100.");
  });

  it("rejects malformed runtime input shapes with validation errors", () => {
    expect(() =>
      calculateQuote(
        quoteInput({ printTime: null } as unknown as Partial<LayerRateQuoteInput>),
      ),
    ).toThrow("printTime must be an object.");

    expect(() =>
      calculateQuote(
        quoteInput({ pricing: null } as unknown as Partial<LayerRateQuoteInput>),
      ),
    ).toThrow("pricing must be an object.");

    expect(() =>
      calculateQuote(
        quoteInput({
          materials: [{}],
        } as unknown as Partial<LayerRateQuoteInput>),
      ),
    ).toThrow("materials[0].amount must be an object.");

    expect(() =>
      calculateQuote(
        quoteInput({ fees: {} } as unknown as Partial<LayerRateQuoteInput>),
      ),
    ).toThrow("fees must be an array.");
  });

  it("rejects incomplete or zero-value fee definitions", () => {
    expect(() =>
      calculateQuote(
        quoteInput({
          fees: [
            {
              fixedAmount: 1,
              behavior: "recover",
            } as unknown as NonNullable<LayerRateQuoteInput["fees"]>[number],
          ],
        }),
      ),
    ).toThrow("fees[0].name must be a string.");

    expect(() =>
      calculateQuote(
        quoteInput({
          fees: [{ name: "Empty fee", behavior: "recover" }],
        }),
      ),
    ).toThrow("fees[0] must include a positive fixedAmount or percent.");
  });

  it("rejects final-customer-price add-on fee percentages that cannot be recovered", () => {
    expect(() =>
      calculateQuote(
        quoteInput({
          fees: [{ name: "Customer fee", percent: 90, behavior: "addOnTop" }],
          taxPercent: 20,
          pricingOptions: {
            taxBasis: "salePricePlusAddOnTopFees",
            addOnTopFeePercentBasis: "finalCustomerPrice",
          },
        }),
      ),
    ).toThrow("addOnTop fee percentages are too high for final customer price basis.");
  });

  it("returns structured validation issues from the public validation API", () => {
    const issues = validateQuoteInput(
      quoteInput({
        fees: [{ name: "Bad percent", percent: 100, behavior: "recover" }],
      }),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: "custom",
        path: "fees",
        message: "recover fee percentages must total less than 100.",
      }),
    ]);
    expect(() => parseQuoteInput({ ...quoteInput(), materials: [] })).toThrow(
      LayerRateValidationError,
    );
  });
});
