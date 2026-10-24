# app/runtime.py
# Lets synchronous node code (running in worker threads) call async DB helpers on the main loop.

import asyncio

_LOOP = None


def set_loop(loop):
    global _LOOP
    _LOOP = loop


def run_async(coro, timeout: float = 30):
    if _LOOP is None:
        coro.close()
        raise RuntimeError("Runtime loop is not initialised.")
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is _LOOP:
        coro.close()
        raise RuntimeError("run_async cannot be called from the event loop thread.")
    return asyncio.run_coroutine_threadsafe(coro, _LOOP).result(timeout)