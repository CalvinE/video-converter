export interface IOutputWriter {
    supportsProgressiveUpdates(): boolean;
    initialize(): Promise<void>;
    write(message: string): void;
    writeLine(message: string): void;
    writeObject(data: unknown): void;
    shutdown(): Promise<void>;
}
