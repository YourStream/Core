
export type ServiceEvent = "started" | "stopped" | "error" | "warning";

export type ServiceEventCallback = (...args: any[]) => void;
export type ServiceEventRecordArray = {
    [key: string]: {
        fun: (...args: any[]) => void,
        once: boolean
    }[]
}