const KEY_PREFIX = 'ina_anon_id__';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Ephemeral fallback
    }
  }
}

function safeGetItem(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    if (value) return value;
  } catch { }

  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getOrCreateAnonId(tenantId: string): string {
  const key = `${KEY_PREFIX}${tenantId}`;

  const existing = safeGetItem(key);
  if (existing) return existing;

  const id = generateUUID();
  safeSetItem(key, id);
  return id;
}