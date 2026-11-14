import type {
  AmountWithMassUnit,
  DurationInput,
  FeeCostBreakdown,
  QuoteCostBreakdown,
} from "./types.js";

const GRAMS_PER_KG = 1000;
const MINUTES_PER_HOUR = 60;

export function massToGrams(amount: AmountWithMassUnit): number {
  if (amount.unit === "kg") {
    return amount.value * GRAMS_PER_KG;
  }

  return amount.value;
}

export function durationToHours(duration: DurationInput): number {
  return (duration.hours ?? 0) + (duration.minutes ?? 0) / MINUTES_PER_HOUR;
}

export function percent(value: number): number {
  return value / 100;
}

export function sumBreakdown(breakdown: QuoteCostBreakdown): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

export function sumFees(fees: FeeCostBreakdown[]): number {
  return fees.reduce((sum, fee) => sum + fee.amount, 0);
}
