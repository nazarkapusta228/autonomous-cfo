// Demo scenario "Pizzeria Amalfi". All future items are ASSUMPTIONS (shown as such in the UI).
export const DEMO = {
  asOf: '2025-05-31',
  openingCents: 200631, // €2,006.31 after bank history up to as_of (replace with parsed CSV result)
  events: [
    { date: '2025-06-03', label: 'Card payout (expected)', cents: 190000 },
    { date: '2025-06-05', label: 'Supplier invoices', cents: -195000 },
    { date: '2025-06-10', label: 'Wage tax', cents: -88000 },
    { date: '2025-06-12', label: 'Card payout (expected)', cents: 240000 },
    { date: '2025-06-15', label: 'Rent', cents: -320000 },
    { date: '2025-06-16', label: 'Temporary closure starts (no revenue)', cents: 0 },
    { date: '2025-06-20', label: 'Income tax prepayment', cents: -115000 },
    { date: '2025-06-28', label: 'Payroll (4 employees)', cents: -860000 },
    { date: '2025-07-05', label: 'Social security', cents: -265000 },
    { date: '2025-07-10', label: 'Card payout after reopening', cents: 520000 },
  ],
};
