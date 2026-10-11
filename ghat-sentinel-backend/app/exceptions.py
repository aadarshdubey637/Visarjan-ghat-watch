import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("ghat_sentinel")


class AppError(Exception):
    status_code = 400
    code = "APP_ERROR"
    headers: dict[str, str] | None = None

    def __init__(self, message: str, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"


class UnprocessableError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"


class AIUnavailableError(AppError):
    status_code = 503
    code = "AI_UNAVAILABLE"


class ChannelNotConfigured(AppError):
    status_code = 503
    code = "CHANNEL_NOT_CONFIGURED"


class RateLimitError(AppError):
    status_code = 429
    code = "RATE_LIMITED"


class UnauthenticatedError(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"
    headers = {"WWW-Authenticate": "Bearer"}


class InvalidCredentialsError(AppError):
    status_code = 401
    code = "INVALID_CREDENTIALS"


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"


class EmailTakenError(ConflictError):
    code = "EMAIL_TAKEN"


class UserNotFoundError(NotFoundError):
    code = "USER_NOT_FOUND"


class CannotDeactivateSelfError(ConflictError):
    code = "CANNOT_DEACTIVATE_SELF"


def _body(code: str, message: str, details=None) -> dict:
    err: dict = {"code": code, "message": message}
    if details:
        err["details"] = details
    return {"error": err}


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message), headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in e.get("loc", []) if p != "body"), "message": str(e.get("msg", ""))}
            for e in exc.errors()
        ]
        return JSONResponse(status_code=422, content=_body("VALIDATION_ERROR", "Invalid request data.", details))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(status_code=exc.status_code, content=_body(code, str(exc.detail)))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error")  # stack trace stays in server logs only
        return JSONResponse(status_code=500, content=_body("INTERNAL_ERROR", "An internal error occurred."))
