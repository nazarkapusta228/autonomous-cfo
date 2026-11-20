import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo


@pytest.fixture
def postgres_url():
    """Provide an empty migrated schema on a configured PostgreSQL test database."""
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to run PostgreSQL integration tests")
    name = f"cfo_test_{uuid4().hex}"
    test_url = make_conninfo(url, options=f"-csearch_path={name}")
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))
        try:
            with psycopg.connect(test_url, autocommit=True) as conn:
                for migration in sorted((Path(__file__).parents[1] / "sql").glob("*.sql")):
                    conn.execute(migration.read_text())
            yield test_url
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
