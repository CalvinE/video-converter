import { IOutputWriter } from './models';

export class ConsoleOutputWriter implements IOutputWriter {
    public initialize(): Promise<void> {
        return Promise.resolve();
    }
    public shutdown(): Promise<void> {
        return Promise.resolve();
    }
    public writeString(message: string): Promise<void> {
        console.log(message);
        return Promise.resolve();
    }
    public writeObject(data: unknown): Promise<void> {
        console.dir(data);
        return Promise.resolve();
    }
}