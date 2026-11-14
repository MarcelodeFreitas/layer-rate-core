import { describe, expect, it } from "vitest";
import { quoteInput } from "./fixtures.js";

describe("built package export", () => {
  it("exports the calculator and validation/schema API from dist", async () => {
    const builtModuleUrl = new URL("../dist/index.js", import.meta.url).href;
    const built = (await import(builtModuleUrl)) as typeof import("../src/index.js");

    expect(built.calculateQuote(quoteInput()).customerPriceAllJobs).toBeCloseTo(
      99.71,
      2,
    );
    expect(built.validateQuoteInput(quoteInput())).toEqual([]);
    expect(built.quoteInputJsonSchema).toMatchObject({
      title: "LayerRateQuoteInput",
      type: "object",
    });
    expect(built.LayerRateValidationError).toBeTypeOf("function");
  });
});
