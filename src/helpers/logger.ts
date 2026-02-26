const tag = (label: string) => `[${label}]`;

export const logger = {
    bot: (msg: string, ...args: unknown[]) => console.log(tag("BOT"), msg, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(tag("BOT:ERROR"), msg, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(tag("BOT:WARN"), msg, ...args),
    send: (msg: string, ...args: unknown[]) => console.log(tag("BOT:SEND"), msg, ...args),
    media: (msg: string, ...args: unknown[]) => console.log(tag("BOT:MEDIA"), msg, ...args),
    cmd: (msg: string, ...args: unknown[]) => console.log(tag("BOT:CMD"), msg, ...args),
};