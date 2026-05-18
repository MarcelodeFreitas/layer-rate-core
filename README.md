# LayerRate Core

LayerRate Core is an open-source 3D print pricing engine.

It calculates transparent quote breakdowns from complete pricing inputs. The core
package only performs calculation; apps built on top of it can handle saved
printers, saved materials, presets, quote history, PDFs, customer accounts, or UI.

Project naming:
- Human-facing brand: LayerRate Core
- Repository/folder/package slug: layer-rate-core
- Future ecosystem slugs should use the same readable style, such as layer-rate-web, layer-rate-mcp, and layer-rate-slicer.

## Current Scope

LayerRate Core calculates one quote with a quantity. It supports:

- one or more materials
- material amounts and prices in grams or kilograms
- print, setup, operations, and post-processing time as hours/minutes objects
- printer depreciation, electricity, maintenance, labor, failure surcharge, design, setup, and components
- markup or margin pricing
- optional tax
- named seller fees recovered into the price
- named customer-paid fees added on top

The package is currency agnostic. Currency values are raw numbers, and the caller
must use the same currency throughout one calculation.

## Example

```ts
import { calculateQuote } from "layer-rate-core";

const quote = calculateQuote({
  designCost: 0,
  materials: [
    {
      name: "PLA",
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

console.log(quote.customerPriceAllJobs);
```

## Outputs

The engine returns raw decimal numbers, including:

- per-job customer price
- base customer price before tax and add-on customer fees
- customer price for all jobs
- seller receipts after recoverable fees
- production cost for all jobs
- total profit
- recoverable fees
- add-on customer fees
- tax
- per-job and all-jobs cost breakdowns
- per-material cost breakdowns
- normalized print hours
- normalized printer lifetime hours

Apps should round and format currency values for display, quotes, invoices, and
locale-specific output.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
```
