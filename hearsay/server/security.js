export function validateProductionOrigins(origins, secureCookie) {
  if (secureCookie !== 'true') {
    throw new Error('[CONFIG] SESSION_COOKIE_SECURE must be true in production');
  }
  if (!origins.length) {
    throw new Error('[CONFIG] API_ORIGIN must contain an origin in production');
  }
  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('[CONFIG] API_ORIGIN contains an invalid origin');
    }
    if (url.origin !== origin) {
      throw new Error('[CONFIG] API_ORIGIN entries must be origins without paths');
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('[CONFIG] API_ORIGIN contains a non-HTTPS remote origin');
    }
  }
}

export function rejectsCrossSiteMutation(req, origins) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false;
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return true;

  const origin = req.headers?.origin;
  if (origin) return !origins.includes(origin);

  const referer = req.headers?.referer;
  if (referer) {
    try {
      return !origins.includes(new URL(referer).origin);
    } catch {
      return true;
    }
  }
  return false;
}
