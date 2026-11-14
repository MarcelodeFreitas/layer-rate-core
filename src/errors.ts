export type LayerRateErrorCode = "VALIDATION_ERROR" | "CALCULATION_ERROR";

export interface LayerRateValidationIssue {
  code: string;
  path: string;
  message: string;
  details?: unknown;
}

export class LayerRateError extends Error {
  constructor(
    message: string,
    public readonly code: LayerRateErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "LayerRateError";
  }
}

export class LayerRateValidationError extends LayerRateError {
  public readonly issues: LayerRateValidationIssue[];

  constructor(issues: LayerRateValidationIssue[]) {
    super(issues[0]?.message ?? "Invalid quote input.", "VALIDATION_ERROR", {
      issues,
    });
    this.name = "LayerRateValidationError";
    this.issues = issues;
  }
}

export class LayerRateCalculationError extends LayerRateError {
  constructor(message: string, details?: unknown) {
    super(message, "CALCULATION_ERROR", details);
    this.name = "LayerRateCalculationError";
  }
}
