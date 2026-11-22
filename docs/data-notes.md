# Importing and reading cash data

In **Data**, choose the dataset and upload a CSV, tabular TXT file or JSON array of objects. Enter amounts received as positive and amounts paid as negative.

| Dataset | Fields to supply |
| --- | --- |
| Bank statement | Account Number, Booking Date, Transaction Type, Payment Reference, Amount and Currency. Optional fields include Value Date, Beneficiary/Payer, Info and Category. |
| Cash flow plan | `date`, `category`, `amount_eur`, `description` and an optional `invoice_id`. |
| Invoices | `invoice_id`, `counterparty`, `issued_on`, `due_on` and `amount_eur`. |

## How inputs affect the forecast

- A booking contributes to the historical balance when both its booking date and value date are on or before the cut-off.
- Known payments replace matching historical projections in the same month. Unmatched projections remain. When a plan row represents an imported invoice, use its invoice ID and matching signed amount to count the commitment once.
- The cash balance chart shows money available at each daily close. Net cash flow measures receipts less payments over a period. A positive net flow can still leave the closing balance below the target reserve.
- In a credit simulation, daily interest reduces available cash. Cash above the reserve can repay outstanding debt. Changing the annual rate can change total interest while leaving the payoff date unchanged if the same receipt still covers the remaining debt.
