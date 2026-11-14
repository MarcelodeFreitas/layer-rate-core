import { describe, expect, it } from "vitest";
import {
  LayerRateCalculationError,
  calculateQuote,
  solvePricingForPerJobPrice,
} from "../src/index.js";
import { quoteInput } from "./fixtures.js";

describe("solvePricingForPerJobPrice", () => {
  it("recovers the markup that produced a quoted price", () => {
    const input = quoteInput({ pricing: { mode: "markup", percent: 80 } });
    const price = calculateQuote(input).perJobCustomerPrice;

    const solution = solvePricingForPerJobPrice(input, price);

    expect(solution.markupPercent).toBeCloseTo(80, 4);
    expect(solution.result.perJobCustomerPrice).toBeCloseTo(price, 6);
  });

  it("reports margin as profit over seller revenue", () => {
    // Without fees or tax, markup m gives margin m / (1 + m).
    const input = quoteInput({ pricing: { mode: "markup", percent: 80 } });
    const price = calculateQuote(input).perJobCustomerPrice;

    const solution = solvePricingForPerJobPrice(input, price);

    expect(solution.marginPercent).toBeCloseTo((80 / 180) * 100, 4);
  });

  it("includes tax in the target price", () => {
    const input = quoteInput({
      taxPercent: 23,
      pricing: { mode: "markup", percent: 80 },
    });
    const price = calculateQuote(input).perJobCustomerPrice;

    const solution = solvePricingForPerJobPrice(input, price);

    expect(solution.markupPercent).toBeCloseTo(80, 4);
  });

  it("throws when the target is below the production cost", () => {
    const input = quoteInput();

    expect(() => solvePricingForPerJobPrice(input, 0.01)).toThrow(
      LayerRateCalculationError,
    );
  });

  it("rejects a non-positive target price", () => {
    expect(() => solvePricingForPerJobPrice(quoteInput(), 0)).toThrow(
      LayerRateCalculationError,
    );
  });
});
