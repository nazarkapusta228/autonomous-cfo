# Data formats and forecast assumptions

## Choosing a dataset

| Dataset | Contents | Use |
| --- | --- | --- |
| Bank statement | Booked amounts, dates, currencies and payment references | Reconstructs the balance and provides the transaction history. |
| Cash flow plan | Expected payments and income with dates and signed EUR amounts | Replaces the default projection of recurring transactions. |
| Invoices | Invoice IDs, counterparties, issue dates, due dates and signed EUR amounts | Matches invoices to bookings and identifies outstanding payments and receipts. |

Import files in **Data**. The web importer accepts CSV, tabular TXT and JSON arrays of objects. For invoices, the standard fields are `invoice_id`, `counterparty`, `issued_on`, `due_on` and `amount_eur`. Positive amounts are receipts; negative amounts are payments. Include the invoice ID in a plan row for the same invoice so the forecast can recognize it. A row without an ID is a separate assumption.

The statement importer identifies an exact file by its SHA-256 hash and preserves separate rows with identical values. Overlapping statements are separate imports. Use one statement covering the period you want to analyze.

## Sample statement

The [Pizzeria Amalfi statement](../data/sample/pizzeria-amalfi-2025.csv) contains 1,125 transactions for 2025, in reverse date order. It uses semicolons, decimal commas and dates in DD.MM.YY format. Twelve CHF transactions include the EUR conversion rate in the payment reference. Imports with an unsupported currency or missing required exchange rate return an error.

The statement contains no opening balance. The sample workspace assumes EUR 2,500 before the first booking. You can change this in **Liquidity Agent**. The table shows how this assumption affects the historical closing balance.

| Date | Starting at EUR 0 | Starting at EUR 2,500 |
| --- | ---: | ---: |
| 30 June 2025 | −22,598.69 | −20,098.69 |
| 3 July 2025 (lowest balance) | −24,597.60 | −22,097.60 |
| 31 December 2025 | 30,766.35 | 33,266.35 |

## Reading a forecast

Only transactions booked and valued by the cut-off date enter the historical balance. The baseline repeats cash flows from the last 28 days every four weeks. An uploaded plan replaces this pattern. Include known closures, one-off spending and seasonal changes in that plan. A day without a planned or projected flow carries the previous balance forward.

Invoice matching uses confirmed bookings to estimate how late customers pay. Overdue receivables without a supported future payment date are shown separately. Daily balances do not establish the order of payments within a day.

**Funding needed** is the gap between the reserve and the lowest projected balance, including the opening balance. When the balance stays at or above the reserve, the shortfall is zero.

Dashed lines show an estimated 90% prediction interval when sufficient recent history is available. The calculation compares each day's net cash flow with the flow 28 days earlier. The interval widens with the forecast horizon and depends on future variation resembling the observed history.
