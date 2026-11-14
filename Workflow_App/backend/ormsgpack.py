import msgpack

# Explicitly define common ormsgpack options
OPT_NON_STR_KEYS = 1
OPT_PASSTHROUGH_BIG_INT = 2
OPT_OMIT_MICROSECONDS = 4
OPT_PASSTHROUGH_ENUM = 8
OPT_PASSTHROUGH_UUID = 16
OPT_PASSTHROUGH_DATETIME = 32
OPT_PASSTHROUGH_DATACLASS = 64
OPT_SERIALIZE_PYDANTIC = 128
OPT_NAIVE_UTC = 256

class Ext(tuple):
    def __new__(cls, code: int, data: bytes):
        return super().__new__(cls, (code, data))
    
    @property
    def code(self):
        return self[0]
    
    @property
    def data(self):
        return self[1]

def packb(obj, default=None, option=None):
    return msgpack.packb(obj, default=default, use_bin_type=True)

def unpackb(packed, ext_hook=None, option=None):
    def _ext_hook(code, data):
        if ext_hook is not None:
            return ext_hook(code, data)
        return Ext(code, data)
    return msgpack.unpackb(packed, ext_hook=_ext_hook, raw=False)

def __getattr__(name):
    # Automatically catch any other missing OPT_ flags or attributes and return 0
    if name.startswith("OPT_"):
        return 0
    raise AttributeError(f"module 'ormsgpack' has no attribute '{name}'")