export function withTimeout(promise, ms = 20000) {
  let timer = null;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([
    Promise.resolve(promise).then((v) => { if (timer) clearTimeout(timer); return v; }, (e) => { if (timer) clearTimeout(timer); throw e; }),
    timeout,
  ]);
}

export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return /failed to fetch|networkerror|network error|load failed|timeout|timed out|aborterror|dns|econn|offline|not connected|connection|refused|unreachable|net::/i.test(msg);
}

export function isAuthInvalidError(err) {
  if (isNetworkError(err)) return false;
  const status = err?.status;
  if (status === 401) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return /invalid (jwt|token|grant|claim|session)|jwt (expired|invalid)|token (expired|invalid|revoked)|session (expired|invalid|revoked|not found)|refresh token (expired|invalid|revoked|not found)|user not found/i.test(msg);
}
