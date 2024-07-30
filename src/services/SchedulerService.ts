import { Scheduler } from "../types/schedulerService.types";
import { BaseService } from "./BaseService";

export class SchedulerService extends BaseService<string> {
    private _schedulers: Map<string, Scheduler> = new Map();
    get name(): string {
        return "SchedulerService";
    }

    start(): Promise<void> {
        this.running = true;
        return Promise.resolve();
    }

    stop(): Promise<void> {
        this.running = false;
        return Promise.resolve();
    }

    addInterval(interval: number, callback: () => void, runAfterCreate: boolean = false): string {
        const id = this.generateId();
        this._schedulers.set(id, {
            id,
            type: 'interval',
            interval,
            callback,
            running: false,
        });
        if (runAfterCreate) {
            this.startScheduler(id);
        }
        this.planNextExecution(id);
        return id;
    }

    addTimeout(timeout: number, callback: () => void, runAfterCreate: boolean = false): string {
        const id = this.generateId();
        this._schedulers.set(id, {
            id,
            type: 'timeout',
            timeout,
            callback,
            running: false,
        });
        if (runAfterCreate) {
            this.startScheduler(id);
        }
        this.planNextExecution(id);
        return id;
    }

    remove(id: string): void {
        if (!this._schedulers.has(id)) {
            throw new Error(`Scheduler with id ${id} not found`);
        }
        this._schedulers.delete(id);
    }

    private generateId(): string {
        return Math.random().toString(36).substring(7);
    }

    private async startScheduler(id: string) {
        while (!this.running){
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const scheduler = this._schedulers.get(id);
        if (!scheduler) {
            return;
        }
        if (scheduler.running) {
            return;
        }
        scheduler.running = true;
        scheduler.callback();
        scheduler.lastExecution = Date.now();
        scheduler.running = false;
    }

    private planNextExecution(id: string) {
        const scheduler = this._schedulers.get(id);
        if (!scheduler) {
            return;
        }
        if (!scheduler.running) {
            return;
        }
        if (scheduler.type === 'interval') {
            setTimeout(async () => {
                await this.startScheduler(id);
                this.planNextExecution(id);
            }, scheduler.interval);
        } else {
            setTimeout(async () => {
                await this.startScheduler(id);
            }, scheduler.timeout);
        }
    }
}