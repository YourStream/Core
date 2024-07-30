export interface IBaseService {
    start(): Promise<void>;
    stop(): Promise<void>;
    get name(): string;
}