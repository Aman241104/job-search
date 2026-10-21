"""Pooled connections that the server/network dropped while idle must be
replaced transparently, and never leak a pool slot (a leak per failure used
to end in "connection pool exhausted" for every request)."""
import os
import socket

from agents import tracker as tr


def _cut_idle_connections():
    for conn in list(tr._pg_pool._pool):
        s = socket.socket(fileno=os.dup(conn.fileno()))
        s.shutdown(socket.SHUT_RDWR)
        s.close()


def _select_one(t):
    with t._get_conn() as c:
        return c.execute("SELECT 1").fetchone()[0]


def test_dead_pooled_connections_are_replaced(tracker):
    _select_one(tracker)
    for _ in range(5):
        _cut_idle_connections()
        assert _select_one(tracker) == 1


def test_failing_block_on_dead_connection_does_not_leak(tracker):
    _select_one(tracker)
    for _ in range(12):            # more than the pool's 10 slots
        _cut_idle_connections()
        try:
            with tracker._get_conn() as c:
                c.execute("SELECT 1")
                raise ValueError("boom")
        except ValueError:
            pass
    assert len(tr._pg_pool._used) == 0
    assert _select_one(tracker) == 1
