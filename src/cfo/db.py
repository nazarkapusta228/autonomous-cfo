from contextlib import nullcontext
from hashlib import sha256

import psycopg
from psycopg.rows import tuple_row

from cfo.ingestion import parse_statement


def import_statement(
    database_url: str, content: bytes, *, scope: str = "", conn: psycopg.Connection | None = None
) -> tuple[int, bool]:
    """Atomically import an exact file once; retain legitimate duplicate source rows."""
    transactions = parse_statement(content)
    session = nullcontext(conn) if conn is not None else psycopg.connect(database_url)
    with session as connection, connection.cursor(row_factory=tuple_row) as cursor:
        cursor.execute(
            "INSERT INTO statement_imports (content_sha256, scope) VALUES (%s, %s) "
            "ON CONFLICT DO NOTHING RETURNING id",
            (sha256(content).hexdigest(), scope),
        )
        row = cursor.fetchone()
        if row is None:
            cursor.execute(
                "SELECT id FROM statement_imports WHERE content_sha256 = %s AND scope = %s",
                (sha256(content).hexdigest(), scope),
            )
            return cursor.fetchone()[0], False
        import_id = row[0]
        cursor.executemany(
            "INSERT INTO transactions (import_id, source_row, account, booked_on, value_on, "
            "kind, reference, amount, currency, amount_eur) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (
                    import_id,
                    t.source_row,
                    t.account,
                    t.booked_on,
                    t.value_on,
                    t.kind,
                    t.reference,
                    t.amount,
                    t.currency,
                    t.amount_eur,
                )
                for t in transactions
            ],
        )
        return import_id, True
