# app/utils/errors.py


class ApiError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, status_code: int | None = None, code: str | None = None, details=None):
        super().__init__(message)
        self.message = message
        self.details = details
        if status_code:
            self.status_code = status_code
        if code:
            self.code = code


class NotFound(ApiError):
    status_code = 404
    code = "not_found"


class Conflict(ApiError):
    status_code = 409
    code = "conflict"


class PortConflict(Conflict):
    code = "port_conflict"


class ValidationFailed(ApiError):
    status_code = 422
    code = "validation_error"


class DockerUnavailable(ApiError):
    status_code = 503
    code = "docker_unavailable"


class OperationFailed(ApiError):
    status_code = 500
    code = "operation_failed"