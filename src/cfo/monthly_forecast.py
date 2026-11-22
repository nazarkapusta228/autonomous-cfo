"""Walk-forward selection using daily cumulative cash error within each held-out month."""

from calendar import monthrange
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
from statistics import stdev

from cfo.models import PlannedCashFlow

CANDIDATES = ((1, False), (3, False), (6, False), (12, False), (3, True), (6, True), (12, True))
CENT = Decimal("0.01")


def month_id(day):
    return day.year * 12 + day.month - 1


def month_start(index):
    year, month = divmod(index, 12)
    return date(year, month + 1, 1)


def profile(rows, target, candidate, first, cutoff):
    """Average signed payment streams on their calendar days; missing months contribute zero."""
    window, weighted = candidate
    start = max(first, target - window)
    months = target - start
    values = Counter()
    if not months:
        return values
    for r in rows:
        if start <= month_id(r.value_on) < target and r.booked_on <= cutoff:
            key = (r.value_on.day, r.kind, r.counterparty or r.kind, r.amount_eur > 0)
            weight = month_id(r.value_on) - start + 1 if weighted else 1
            values[key] += r.amount_eur * weight
    divisor = months * (months + 1) // 2 if weighted else months
    return {key: (value / divisor).quantize(CENT) for key, value in values.items()}


def project(transactions, cutoff, days):
    rows = [r for r in transactions if max(r.booked_on, r.value_on) <= cutoff]
    if not rows:
        return [], (1, False), 0, None
    first = max(min(month_id(r.value_on) for r in rows), month_id(cutoff) - 12)
    target = month_id(cutoff) + int(cutoff.day == monthrange(cutoff.year, cutoff.month)[1])
    first = max(first, target - 12)
    errors = Counter({w: 0 for w in CANDIDATES})
    residuals = {candidate: [] for candidate in CANDIDATES}
    for month in range(first + 1, target):
        start = month_start(month)
        end = month_start(month + 1) - timedelta(days=1)
        actual = Counter()
        for r in rows:
            if month_id(r.value_on) == month and r.booked_on <= end:
                actual[r.value_on.day] += r.amount_eur
        for window in CANDIDATES:
            predicted = Counter()
            for (day, *_), amount in profile(
                rows, month, window, first, start - timedelta(days=1)
            ).items():
                predicted[min(day, end.day)] += amount
            drift = Decimal(0)
            for day in range(1, end.day + 1):
                error = predicted[day] - actual[day]
                residuals[window].append(float(error))
                drift += error
                errors[window] += abs(drift) / end.day
    winner = min(CANDIDATES, key=errors.get)
    # Before the first completed month, replay observed dates into the following month.
    training_end = max(target, first + 1)
    values = profile(rows, training_end, winner, first, cutoff)
    end = cutoff + timedelta(days=days)
    flows = []
    for month in range(month_id(cutoff), month_id(end) + 1):
        start = month_start(month)
        last = monthrange(start.year, start.month)[1]
        for (day, kind, party, _), amount in sorted(values.items()):
            due = start.replace(day=min(day, last))
            if cutoff < due <= end and amount:
                flows.append(
                    PlannedCashFlow(
                        date=due,
                        category=kind,
                        amount_eur=amount,
                        description=f"Projection · {party}",
                    )
                )
    folds = max(0, target - first - 1)
    scale = stdev(residuals[winner]) if folds >= 2 else None
    return flows, winner, folds, scale or None


def supplement(projected, commitments, invoice_parties):
    """Replace the nearest historical recurrence of an identifiable known payment."""
    used = set()
    for known in sorted(commitments, key=lambda f: f.date):
        party = invoice_parties.get(known.invoice_id, "").casefold()
        description = known.description.casefold()
        category = known.category.casefold()
        matches = []
        for i, estimate in enumerate(projected):
            if (
                i in used
                or month_id(estimate.date) != month_id(known.date)
                or (known.amount_eur > 0) != (estimate.amount_eur > 0)
            ):
                continue
            payee = estimate.description.removeprefix("Projection · ").casefold()
            kind = estimate.category.casefold()
            named = payee == party or payee in description
            same_kind = category == kind or (len(category) >= 4 and category in kind.split())
            if named or (same_kind and estimate.date == known.date):
                matches.append(
                    (
                        not named,
                        abs((estimate.date - known.date).days),
                        abs(estimate.amount_eur - known.amount_eur),
                        i,
                    )
                )
        if matches:
            used.add(min(matches)[-1])
    return [flow for i, flow in enumerate(projected) if i not in used]
