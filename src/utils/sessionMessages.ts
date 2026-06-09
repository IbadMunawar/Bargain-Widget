const KEY_PREFIX = 'ina_msgs__';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface StoredMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  dealPrice?: number;
}

interface MessageBundle {
  timestamp: number;
  messages: StoredMessage[];
}

export function saveMessages(sessionId: string, messages: StoredMessage[]): void {
  const key = `${KEY_PREFIX}${sessionId}`;
  const bundle: MessageBundle = {
    timestamp: Date.now(),
    messages,
  };

  try {
    localStorage.setItem(key, JSON.stringify(bundle));
  } catch {
    // Storage full or blocked
  }
}

export function loadMessages(sessionId: string): StoredMessage[] | null {
  const key = `${KEY_PREFIX}${sessionId}`;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const bundle: MessageBundle = JSON.parse(raw);

    if (Date.now() - bundle.timestamp > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return bundle.messages;
  } catch {
    return null;
  }
}

export function clearMessages(sessionId: string): void {
  const key = `${KEY_PREFIX}${sessionId}`;

  try {
    localStorage.removeItem(key);
  } catch { }
}