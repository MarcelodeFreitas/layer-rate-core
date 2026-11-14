import { z } from "zod";
import {
  LayerRateValidationError,
  type LayerRateValidationIssue,
} from "./errors.js";
import type { LayerRateQuoteInput } from "./types.js";

const HOURS_PER_DAY = 24;
const RAW_MESSAGE_PREFIX = "__raw__:";

const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.min(0);

export const massAmountSchema = z.object({
  value: nonNegativeFiniteNumberSchema,
  unit: z.enum(["g", "kg"]),
});

export const durationSchema = z
  .object({
    hours: nonNegativeFiniteNumberSchema.optional(),
    minutes: nonNegativeFiniteNumberSchema.optional(),
  })
  .superRefine((duration, context) => {
    if (duration.hours === undefined && duration.minutes === undefined) {
      context.addIssue({
        code: "custom",
        message: "must include hours, minutes, or both.",
      });
    }
  });

export const pricingSchema = z
  .object({
    mode: z.enum(["markup", "margin"]),
    percent: nonNegativeFiniteNumberSchema,
  })
  .superRefine((pricing, context) => {
    if (pricing.mode === "margin" && pricing.percent >= 100) {
      context.addIssue({
        code: "custom",
        path: ["percent"],
        message: rawMessage("pricing.percent must be less than 100 for margin pricing."),
      });
    }
  });

export const pricingOptionsSchema = z
  .object({
    taxBasis: z.enum(["salePrice", "salePricePlusAddOnTopFees"]).optional(),
    addOnTopFeePercentBasis: z
      .enum(["preTaxCustomerPrice", "finalCustomerPrice"])
      .optional(),
  })
  .optional();

export const feeSchema = z
  .object({
    name: z.string(),
    fixedAmount: nonNegativeFiniteNumberSchema.optional(),
    percent: nonNegativeFiniteNumberSchema.optional(),
    behavior: z.enum(["recover", "addOnTop"]),
  })
  .superRefine((fee, context) => {
    if ((fee.fixedAmount ?? 0) === 0 && (fee.percent ?? 0) === 0) {
      context.addIssue({
        code: "custom",
        message: "must include a positive fixedAmount or percent.",
      });
    }
  });

export const quoteInputSchema = z
  .object({
    designCost: nonNegativeFiniteNumberSchema,
    materials: z
      .array(
        z.object({
          name: z.string().optional(),
          amount: massAmountSchema,
          costPer: massAmountSchema,
        }),
      )
      .min(1),
    printTime: durationSchema,
    printerPurchasePrice: nonNegativeFiniteNumberSchema,
    printerPowerWatts: nonNegativeFiniteNumberSchema,
    electricityCostPerKwh: nonNegativeFiniteNumberSchema,
    printerLifetimeYears: finiteNumberSchema.gt(0),
    typicalUsageHoursPerDay: finiteNumberSchema.gt(0).max(HOURS_PER_DAY),
    repairRatioPercent: nonNegativeFiniteNumberSchema,
    laborCostPerHour: nonNegativeFiniteNumberSchema,
    setupTime: durationSchema,
    operationsTime: durationSchema,
    postProcessingTime: durationSchema,
    failRatioPercent: nonNegativeFiniteNumberSchema.max(100),
    componentCost: nonNegativeFiniteNumberSchema,
    pricing: pricingSchema,
    pricingOptions: pricingOptionsSchema,
    quantity: nonNegativeFiniteNumberSchema.superRefine((quantity, context) => {
      if (quantity < 1 || !Number.isInteger(quantity)) {
        context.addIssue({
          code: "custom",
          message: rawMessage("quantity must be a positive integer."),
        });
      }
    }),
    taxPercent: nonNegativeFiniteNumberSchema.optional(),
    fees: z.array(feeSchema).optional(),
  })
  .superRefine((input, context) => {
    validateFeePercentTotal(input.fees ?? [], "recover", context);
    validateFeePercentTotal(input.fees ?? [], "addOnTop", context);
  });

export const quoteInputJsonSchema = {
  ...z.toJSONSchema(quoteInputSchema, {
    io: "input",
  }),
  title: "LayerRateQuoteInput",
};

type QuoteInputSchemaOutput = z.output<typeof quoteInputSchema>;
type SchemaOutputExtendsInput = QuoteInputSchemaOutput extends LayerRateQuoteInput
  ? true
  : never;
type InputExtendsSchemaOutput = LayerRateQuoteInput extends QuoteInputSchemaOutput
  ? true
  : never;
type SchemaMatchesLayerRateQuoteInput = SchemaOutputExtendsInput &
  InputExtendsSchemaOutput;

const schemaMatchesLayerRateQuoteInput: SchemaMatchesLayerRateQuoteInput = true;
void schemaMatchesLayerRateQuoteInput;

export function validateQuoteInput(input: unknown): LayerRateValidationIssue[] {
  const result = quoteInputSchema.safeParse(input);

  if (result.success) {
    return [];
  }

  return result.error.issues.map(toValidationIssue);
}

export function parseQuoteInput(input: unknown): LayerRateQuoteInput {
  const issues = validateQuoteInput(input);

  if (issues.length > 0) {
    throw new LayerRateValidationError(issues);
  }

  return input as LayerRateQuoteInput;
}

export function assertValidQuoteInput(
  input: unknown,
): asserts input is LayerRateQuoteInput {
  parseQuoteInput(input);
}

function validateFeePercentTotal(
  fees: NonNullable<LayerRateQuoteInput["fees"]>,
  behavior: NonNullable<LayerRateQuoteInput["fees"]>[number]["behavior"],
  context: z.RefinementCtx,
): void {
  const totalPercent = fees
    .filter((fee) => fee.behavior === behavior)
    .reduce((sum, fee) => sum + (fee.percent ?? 0), 0);

  if (totalPercent >= 100) {
    context.addIssue({
      code: "custom",
      path: ["fees"],
      message: rawMessage(`${behavior} fee percentages must total less than 100.`),
    });
  }
}

function toValidationIssue(issue: z.core.$ZodIssue): LayerRateValidationIssue {
  const path = formatPath(issue.path);
  const message = messageFromIssue(issue, path);

  return {
    code: issue.code,
    path,
    message,
    details: issue,
  };
}

function messageFromIssue(issue: z.core.$ZodIssue, path: string): string {
  if (issue.message.startsWith(RAW_MESSAGE_PREFIX)) {
    return issue.message.slice(RAW_MESSAGE_PREFIX.length);
  }

  if (issue.code === "custom") {
    return path === "" ? issue.message : `${path} ${issue.message}`;
  }

  if (issue.code === "invalid_type") {
    return invalidTypeMessage(issue, path);
  }

  if (issue.code === "invalid_value") {
    return invalidValueMessage(path);
  }

  if (issue.code === "too_small") {
    return tooSmallMessage(issue, path);
  }

  if (issue.code === "too_big") {
    return tooBigMessage(path);
  }

  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

function invalidTypeMessage(issue: z.core.$ZodIssue, path: string): string {
  const expected = "expected" in issue ? issue.expected : undefined;

  if (expected === "object") {
    return `${pathOrInput(path)} must be an object.`;
  }

  if (expected === "array") {
    return `${pathOrInput(path)} must be an array.`;
  }

  if (expected === "string") {
    return `${pathOrInput(path)} must be a string.`;
  }

  if (expected === "number") {
    return `${pathOrInput(path)} must be a finite number.`;
  }

  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

function invalidValueMessage(path: string): string {
  if (path.endsWith(".unit")) {
    return `${path} must be "g" or "kg".`;
  }

  if (path === "pricing.mode") {
    return 'pricing.mode must be "markup" or "margin".';
  }

  if (path === "pricingOptions.taxBasis") {
    return 'pricingOptions.taxBasis must be "salePrice" or "salePricePlusAddOnTopFees".';
  }

  if (path === "pricingOptions.addOnTopFeePercentBasis") {
    return 'pricingOptions.addOnTopFeePercentBasis must be "preTaxCustomerPrice" or "finalCustomerPrice".';
  }

  if (path.endsWith(".behavior")) {
    return `${path} must be "recover" or "addOnTop".`;
  }

  return `${pathOrInput(path)} has an invalid value.`;
}

function tooSmallMessage(issue: z.core.$ZodIssue, path: string): string {
  if (path === "materials") {
    return "materials must contain at least one material.";
  }

  if ("minimum" in issue && issue.minimum === 0) {
    return `${pathOrInput(path)} cannot be negative.`;
  }

  if (path === "printerLifetimeYears") {
    return "printerLifetimeYears must be greater than 0.";
  }

  if (path === "typicalUsageHoursPerDay") {
    return "typicalUsageHoursPerDay must be greater than 0.";
  }

  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

function tooBigMessage(path: string): string {
  if (path === "typicalUsageHoursPerDay") {
    return "typicalUsageHoursPerDay cannot exceed 24.";
  }

  if (path === "failRatioPercent") {
    return "failRatioPercent cannot exceed 100.";
  }

  return `${pathOrInput(path)} is too large.`;
}

function formatPath(path: readonly (string | number | symbol)[]): string {
  return path.reduce<string>((currentPath, segment) => {
    if (typeof segment === "number") {
      return `${currentPath}[${segment}]`;
    }

    if (typeof segment === "symbol") {
      return currentPath;
    }

    return currentPath === "" ? segment : `${currentPath}.${segment}`;
  }, "");
}

function pathOrInput(path: string): string {
  return path === "" ? "input" : path;
}

function rawMessage(message: string): string {
  return `${RAW_MESSAGE_PREFIX}${message}`;
}
