export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncRoute = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

export function errorHandler(error, request, response, _next) {
  if (error?.code === "23505") {
    return response
      .status(409)
      .json({ error: { code: "conflict", message: "Dữ liệu đã tồn tại." } });
  }
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  return response.status(status).json({
    error: {
      code: error.code || "internal_error",
      message:
        status >= 500
          ? "Máy chủ gặp lỗi. Vui lòng thử lại sau."
          : error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(request.id ? { requestId: request.id } : {}),
    },
  });
}
