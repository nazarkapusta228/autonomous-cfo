"""Run the agents and approval workflow without a dashboard."""

import argparse
import json
import sys
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import UUID, uuid4

import psycopg

from cfo.analysis import prepare_analysis
from cfo.config import Settings
from cfo.db import import_statement
from cfo.ledger import load_invoice_decisions, parse_invoices
from cfo.llm import ModelError
from cfo.scenarios import SettlementTerms, compare_scenarios
from cfo.service import assess, database_dsn
from cfo.workflow import decide, get_recommendation

DATA = Path("data/sample")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("forecast", "run"):
        cmd = commands.add_parser(name)
        cmd.add_argument("--statement", type=Path, default=DATA / "pizzeria-amalfi-2025.csv")
        cmd.add_argument("--plan", type=Path, default=DATA / "pizzeria-amalfi-liquidity-plan.csv")
        cmd.add_argument("--invoices", type=Path)
        cmd.add_argument("--as-of", type=date.fromisoformat, default=date(2025, 5, 31))
        cmd.add_argument("--opening", type=Decimal, default=Decimal("2500"))
        cmd.add_argument("--reserve", type=Decimal, default=Decimal("0"))
        cmd.add_argument("--days", type=int, choices=range(1, 367), metavar="1..366", default=45)
        if name == "run":
            cmd.add_argument("role", choices=("liquidity", "investment"))
            cmd.add_argument("--request-id", type=UUID, default=None)
    for name in ("show", "approve", "reject"):
        cmd = commands.add_parser(name)
        cmd.add_argument("id", type=int)
        if name != "show":
            cmd.add_argument("--actor", required=True)
    preview = commands.add_parser("preview")
    preview.add_argument("id", type=int)
    preview.add_argument("--settles-on", type=date.fromisoformat, required=True)
    preview.add_argument("--interest-eur", type=Decimal, required=True)
    args = parser.parse_args()
    try:
        settings = Settings()
        if args.command in ("forecast", "run"):
            statement = args.statement.read_bytes()
            invoices = args.invoices.read_bytes() if args.invoices else None
            confirmed = {}
            if args.command == "run":
                dsn = database_dsn(settings)
                import_id, _ = import_statement(dsn, statement)
                if invoices is not None:
                    confirmed = load_invoice_decisions(
                        dsn, import_id, parse_invoices(invoices), as_of=args.as_of
                    )
            analysis = prepare_analysis(
                statement,
                args.plan.read_bytes(),
                as_of=args.as_of,
                starting_balance=args.opening,
                horizon_days=args.days,
                reserve=args.reserve,
                invoices=invoices,
                confirmed=confirmed,
            )
            if args.command == "forecast":
                print(analysis.model_dump_json(indent=2))
                return 0
            request_id = args.request_id or uuid4()
            print(f"Request ID: {request_id}", file=sys.stderr)
            result = assess(settings, analysis, args.role, request_id=request_id)
        elif args.command == "preview":
            saved = get_recommendation(database_dsn(settings), args.id)
            result = compare_scenarios(
                saved.forecast,
                saved.recommendation,
                SettlementTerms(settles_on=args.settles_on, interest_eur=args.interest_eur),
            )
        elif args.command == "show":
            result = get_recommendation(database_dsn(settings), args.id)
        else:
            result = decide(database_dsn(settings), args.id, args.command, actor=args.actor)
        print(result.model_dump_json(indent=2))
        return 0
    except ModelError as exc:
        print(
            json.dumps({"error": exc.code, "message": str(exc), "retryable": exc.retryable}),
            file=sys.stderr,
        )
    except psycopg.Error:
        print(
            "Database request failed. Check DATABASE_URL, migrations and connectivity.",
            file=sys.stderr,
        )
    except (OSError, ValueError, LookupError, InvalidOperation) as exc:
        print(str(exc), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
