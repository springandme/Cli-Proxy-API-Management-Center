const buildNormalizedHost = (protocol: string, hostname: string, port: string) => {
  const normalizedHost = hostname.includes(':') ? `[${hostname}]` : hostname;
  return `${protocol}//${normalizedHost}${port ? `:${port}` : ''}`;
};

export const normalizeDenoProxyHost = (value: string): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error('Host is required');
  }

  const parsed = new URL(trimmed);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('Host must use http or https');
  }
  if (!parsed.hostname) {
    throw new Error('Host is required');
  }
  if (parsed.pathname && parsed.pathname !== '/') {
    throw new Error('Path is not allowed');
  }
  if (parsed.search) {
    throw new Error('Query parameters are not allowed');
  }
  if (parsed.hash) {
    throw new Error('Fragments are not allowed');
  }

  return buildNormalizedHost(protocol, parsed.hostname.toLowerCase(), parsed.port);
};

export const normalizeDenoProxyHostForMatch = (value: string): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  try {
    return normalizeDenoProxyHost(trimmed);
  } catch {
    if (trimmed.includes('://')) return '';
    try {
      return normalizeDenoProxyHost(`https://${trimmed}`);
    } catch {
      return '';
    }
  }
};

export const parseBulkDenoProxyHosts = (value: string) => {
  const rawItems = String(value ?? '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const hosts: string[] = [];
  const invalid: string[] = [];

  rawItems.forEach((item) => {
    try {
      const normalized = normalizeDenoProxyHost(item);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      hosts.push(normalized);
    } catch {
      invalid.push(item);
    }
  });

  return { hosts, invalid };
};

export const denoProxyProbeLooksHealthy = (result: {
  root: { ok: boolean };
  robots: { ok: boolean };
  codexHttp: { ok: boolean };
  codexWebsocket: { ok: boolean };
}) => result.root.ok && result.robots.ok && (result.codexHttp.ok || result.codexWebsocket.ok);
