export interface IRunner {
    run(): Promise<void>;
    stop(): Promise<void>;
}
