export type Scheduler = {
    id: string;
    type: 'interval' | 'timeout';
    interval?: number;
    timeout?: number;
    callback: () => void;
    running: boolean;
    lastExecution?: number;
}