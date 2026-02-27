import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    ...(isDev && {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
            },
        },
    }),
});

export const log = {
    bot: (msg: string, ...args: unknown[]) => logger.info({ args }, msg),
    error: (msg: string, ...args: unknown[]) => logger.error({ args }, msg),
    warn: (msg: string, ...args: unknown[]) => logger.warn({ args }, msg),
    send: (msg: string, ...args: unknown[]) => logger.debug({ args }, msg),
    media: (msg: string, ...args: unknown[]) => logger.debug({ args }, msg),
    cmd: (msg: string, ...args: unknown[]) => logger.debug({ args }, msg),
};