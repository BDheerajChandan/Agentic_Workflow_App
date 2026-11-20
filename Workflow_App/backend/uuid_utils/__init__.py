"""Pure-Python stand-in for the `uuid-utils` native extension (blocked by Windows Application Control).
Implements only what langsmith / langchain-core use: uuid_utils.compat.uuid7(timestamp=None, nanos=None)."""

import os
import threading
import time
from uuid import UUID, uuid1, uuid3, uuid4, uuid5  # noqa: F401

__version__ = "0.0.0+purepython"

_lock = threading.Lock()
_last_ms = 0
_seq = 0


def uuid7(timestamp=None, nanos=None):
    global _last_ms, _seq
    if timestamp is not None:
        ms = int(timestamp) * 1000 + int(nanos or 0) // 1_000_000
        rand = int.from_bytes(os.urandom(10), "big")
        rand_a, rand_b = (rand >> 62) & 0xFFF, rand & ((1 << 62) - 1)
    else:
        with _lock:
            ms = time.time_ns() // 1_000_000
            if ms > _last_ms:
                _last_ms, _seq = ms, int.from_bytes(os.urandom(2), "big") & 0x3FF
            else:
                _seq += 1
                if _seq > 0xFFF:
                    _last_ms, _seq = _last_ms + 1, 0
                ms = _last_ms
            rand_a = _seq
        rand_b = int.from_bytes(os.urandom(8), "big") & ((1 << 62) - 1)
    value = ((ms & 0xFFFFFFFFFFFF) << 80) | (0x7 << 76) | (rand_a << 64) | (0b10 << 62) | rand_b
    return UUID(int=value)