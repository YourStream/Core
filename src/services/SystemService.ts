import { BaseService } from "./BaseService.js";
import { logger } from "../utils/index.js";
import { SystemServiceEvent } from "../types/systemService.types.js";

export class SystemService extends BaseService<SystemServiceEvent> {
    get name(): string {
        return 'SystemService';
    }
    start(): Promise<void> {
        logger.info('Starting System Service');
        this.emit('start');
        return Promise.resolve();
    }
    stop(): Promise<void> {
        logger.info('Stopping System Service');
        this.emit('stop');
        return Promise.resolve();
    }
    public async restart(): Promise<void> {
        this.emit('restart');
    }
    public async shutdown(): Promise<void> {
        this.emit('shutdown');
        process.exit(0);
    }
}