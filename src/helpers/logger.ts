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

// Error instances only expose message/stack as non-enumerable props, so JSON.stringify
// (what pino uses under the hood) turns them into "{}". Serialize them explicitly.
function serializeArgs(args: unknown[]): unknown[] {
    return args.map((arg) => (arg instanceof Error ? pino.stdSerializers.err(arg) : arg));
}

export const log = {
    bot: (msg: string, ...args: unknown[]) => logger.info({ args: serializeArgs(args) }, msg),
    error: (msg: string, ...args: unknown[]) => logger.error({ args: serializeArgs(args) }, msg),
    warn: (msg: string, ...args: unknown[]) => logger.warn({ args: serializeArgs(args) }, msg),
    send: (msg: string, ...args: unknown[]) => logger.debug({ args: serializeArgs(args) }, msg),
    media: (msg: string, ...args: unknown[]) => logger.debug({ args: serializeArgs(args) }, msg),
    cmd: (msg: string, ...args: unknown[]) => logger.debug({ args: serializeArgs(args) }, msg),
};