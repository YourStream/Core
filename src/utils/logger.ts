import { pino } from 'pino';

class Logger {
    private static _instance: Logger;
    public static get instance(): Logger {
        if (!Logger._instance) {
            Logger._instance = new Logger();
        }
        return Logger._instance
    }

    private _logger = pino({
        level: process.env.LOG_LEVEL || 'info',
        name: `${process.env.SERVICE_NAME}`
    });

    public get logger() {
        return this._logger;
    }
}

export default Logger.instance.logger;