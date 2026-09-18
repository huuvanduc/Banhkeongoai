import { config } from "../config.js";
import { HttpError } from "../lib/http.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function verifyMutationOrigin(request, _response, next) {
  if (SAFE_METHODS.has(request.method)) return next();
  const origin = request.get("origin");
  if (!origin || origin !== config.publicOrigin) {
    return next(
      new HttpError(403, "invalid_origin", "Nguồn yêu cầu không hợp lệ."),
    );
  }
  return next();
}
