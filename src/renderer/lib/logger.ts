type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogPayload {
  [key: string]: unknown;
}

const namespace = 'markdown-editor';

function write(level: LogLevel, event: string, payload: LogPayload = {}): void {
  const record = {
    app: namespace,
    level,
    event,
    payload,
    timestamp: new Date().toISOString(),
  };
  const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  target(`[${namespace}] ${event}`, record);
}

export const rendererLog = {
  debug(event: string, payload?: LogPayload): void {
    write('debug', event, payload);
  },
  info(event: string, payload?: LogPayload): void {
    write('info', event, payload);
  },
  warn(event: string, payload?: LogPayload): void {
    write('warn', event, payload);
  },
  error(event: string, payload?: LogPayload): void {
    write('error', event, payload);
  },
};
