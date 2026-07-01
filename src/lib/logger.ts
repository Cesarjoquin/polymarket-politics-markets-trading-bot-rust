export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

function shouldLog(current: LogLevel, messageLevel: LogLevel): boolean {
  return LEVEL_PRIORITY[messageLevel] >= LEVEL_PRIORITY[current];
}

function write(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.error(line);
  }
}

export function createLogger(
  level: LogLevel,
  context: Record<string, unknown> = {},
): Logger {
  const log =
    (messageLevel: LogLevel) =>
    (message: string, meta?: Record<string, unknown>): void => {
      if (!shouldLog(level, messageLevel)) {
        return;
      }
      write(messageLevel, message, { ...context, ...meta });
    };

  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child(childContext: Record<string, unknown>): Logger {
      return createLogger(level, { ...context, ...childContext });
    },
  };
}
