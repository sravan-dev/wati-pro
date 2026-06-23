type Meta = Record<string, unknown>;

function emit(level: 'info' | 'error', requestId: string, message: string, meta?: Meta): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, requestId, message, ...meta });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logInfo = (requestId: string, message: string, meta?: Meta): void =>
  emit('info', requestId, message, meta);

export const logError = (requestId: string, message: string, meta?: Meta): void =>
  emit('error', requestId, message, meta);
