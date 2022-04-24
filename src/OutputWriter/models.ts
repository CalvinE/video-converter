export interface IOutputWriter {
    initialize(): Promise<void>;
    writeString(message:string): Promise<void>;
    writeObject(data: unknown): Promise<void>;
    shutdown(): Promise<void>;
}