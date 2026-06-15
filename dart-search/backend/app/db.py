"""PostgreSQL 연결 풀 (psycopg 3)."""
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

from .settings import DATABASE_URL

_pool = None


def pool():
    global _pool
    if _pool is None:
        _pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, kwargs={"row_factory": dict_row})
    return _pool


def query(sql, params=None):
    with pool().connection() as con:
        with con.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchall()


def query_one(sql, params=None):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=None):
    with pool().connection() as con:
        with con.cursor() as cur:
            cur.execute(sql, params or [])
        con.commit()
