import { EventEmitter } from "events";
import { ServiceEvent, ServiceEventCallback, ServiceEventRecordArray } from "../types/service.types";
import { IBaseService } from "./IBaseService";


export abstract class BaseService<EXPANSION_EVENTS extends string> implements EventEmitter, IBaseService {

    private _maxListeners: number = 0;

    protected _events: ServiceEventRecordArray = {};

    private _running: boolean = false;
    protected warning: boolean = false;

    protected set running(value: boolean) {
        this._running = value;
    }

    public get running(): boolean {
        return this._running;
    }

    abstract start(): Promise<void>
    abstract stop(): Promise<void>;
    abstract get name(): string;

    protected validateRunning(): void {
        if (!this.running) {
            throw new Error(`Service "${this.name}" not running!`);
        }
    }

    addListener(eventName: ServiceEvent | EXPANSION_EVENTS, listener: ServiceEventCallback): this {
        return this.on(eventName, listener);
    }
    on(eventName: ServiceEvent | EXPANSION_EVENTS, listener: ServiceEventCallback): this {
        this._events[eventName] = this._events[eventName] || [];
        if (this._events[eventName].length >= this._maxListeners && this._maxListeners > 0) {
            throw new Error("Max listeners reached");
        }
        this._events[eventName].push({
            fun: listener,
            once: false
        });
        return this;
    }
    once(eventName: ServiceEvent | EXPANSION_EVENTS, listener: ServiceEventCallback): this {
        this._events[eventName] = this._events[eventName] || [];
        this._events[eventName].push({
            fun: listener,
            once: true
        });
        return this;
    }
    removeListener(eventName: ServiceEvent | EXPANSION_EVENTS, listener: ServiceEventCallback): this {
        return this.off(eventName, listener);
    }
    off(eventName: ServiceEvent | EXPANSION_EVENTS, listener: ServiceEventCallback): this {
        if (this._events[eventName]) {
            const index = this._events[eventName].findIndex((e) => e.fun === listener);
            if (index >= 0) {
                this._events[eventName].splice(index, 1);
            }
        }
        return this;
    }
    removeAllListeners(event?: ServiceEvent | EXPANSION_EVENTS | undefined): this {
        if (event) {
            this._events[event] = [];
        } else {
            this._events = {};
        }
        return this;
    }
    setMaxListeners(n: number): this {
        this._maxListeners = n;
        return this;
    }
    getMaxListeners(): number {
        return this._maxListeners;
    }
    listeners(eventName: ServiceEvent | EXPANSION_EVENTS): Function[] {
        return [...this._events[eventName].map((e) => e.fun)];
    }
    rawListeners(eventName: ServiceEvent | EXPANSION_EVENTS): Function[] {
        return this._events[eventName].map((e) => e.fun);
    }
    emit(eventName: ServiceEvent | EXPANSION_EVENTS, ...args: any[]): boolean {
        if (this._events[eventName]) {
            this._events[eventName].forEach((e) => {
                e.fun(...args);
                if (e.once) {
                    this.off(eventName, e.fun);
                }
            });
        }
        return true;
    }
    listenerCount(eventName: ServiceEvent | EXPANSION_EVENTS): number {
        if (this._events[eventName]) {
            return this._events[eventName].length;
        }
        return 0;
    }
    prependListener(eventName: ServiceEvent | EXPANSION_EVENTS, listener: ServiceEventCallback): this {
        this._events[eventName] = this._events[eventName] || [];
        this._events[eventName].unshift({
            fun: listener,
            once: false
        });
        return this;
    }
    prependOnceListener(eventName: ServiceEvent | EXPANSION_EVENTS, listener: ServiceEventCallback): this {
        this._events[eventName] = this._events[eventName] || [];
        this._events[eventName].unshift({
            fun: listener,
            once: true
        });
        return this;
    }
    eventNames(): (ServiceEvent | EXPANSION_EVENTS)[] {
        return Object.keys(this._events) as (ServiceEvent | EXPANSION_EVENTS)[];
    }
}