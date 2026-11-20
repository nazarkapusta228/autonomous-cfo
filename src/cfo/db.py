from hashlib import sha256

import psycopg

from cfo.ingestion import parse_statement


def import_statement(database_url: str, content: bytes) -> tuple[int, bool]:
    """Atomically import an exact file once; retain legitimate duplicate source rows."""
    transactions = parse_statement(content)
    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO statement_imports (content_sha256) VALUES (%s) "
            "ON CONFLICT DO NOTHING RETURNING id",
            (sha256(content).hexdigest(),),
        )
        row = cursor.fetchone()
        if row is None:
            cursor.execute(
                "SELECT id FROM statement_imports WHERE content_sha256 = %s",
                (sha256(content).hexdigest(),),
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
