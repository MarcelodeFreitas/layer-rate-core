import { calculateQuote } from "./calculateQuote.js";
import { LayerRateCalculationError } from "./errors.js";
import type { LayerRateQuoteInput, LayerRateQuoteResult } from "./types.js";

const MAX_MARKUP_PERCENT = 1_000_000;
const BISECTION_STEPS = 200;

export interface PriceTargetSolution {
  markupPercent: number;
  marginPercent: number;
  result: LayerRateQuoteResult;
}

// Finds the markup that makes the per-job customer price (tax included) equal perJobPrice.
// Margin is profit as a share of what the seller receives, the same basis as margin pricing.
export function solvePricingForPerJobPrice(
  input: LayerRateQuoteInput,
  perJobPrice: number,
): PriceTargetSolution {
  if (!Number.isFinite(perJobPrice) || perJobPrice <= 0) {
    throw new LayerRateCalculationError("Target price must be a positive number.", {
      perJobPrice,
    });
  }

  const quoteAt = (markupPercent: number): LayerRateQuoteResult =>
    calculateQuote({ ...input, pricing: { mode: "markup", percent: markupPercent } });

  const minimumPrice = quoteAt(0).perJobCustomerPrice;
  if (perJobPrice < minimumPrice) {
    throw new LayerRateCalculationError(
      "Target price is below the production cost, so no markup reaches it.",
      { perJobPrice, minimumPrice },
    );
  }

  if (quoteAt(MAX_MARKUP_PERCENT).perJobCustomerPrice < perJobPrice) {
    throw new LayerRateCalculationError("Target price is too high to solve.", {
      perJobPrice,
    });
  }

  let low = 0;
  let high = MAX_MARKUP_PERCENT;

  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2;

    if (quoteAt(middle).perJobCustomerPrice < perJobPrice) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const result = quoteAt(high);
  const sellerReceives = result.sellerReceivesAllJobs;

  return {
    markupPercent: high,
    marginPercent: sellerReceives > 0 ? (result.totalProfitAllJobs / sellerReceives) * 100 : 0,
    result,
  };
}
