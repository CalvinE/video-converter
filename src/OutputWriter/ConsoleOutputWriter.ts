import { IOutputWriter } from './models';

export class ConsoleOutputWriter implements IOutputWriter {
    public supportsProgressiveUpdates(): boolean {
        return process?.stdout?.columns > 0 || false;
    }
    public initialize(): Promise<void> {
        return Promise.resolve();
    }
    public shutdown(): Promise<void> {
        return Promise.resolve();
    }
    public write(message: string): void {
        process.stdout.write(message);
        return;
    }
    public writeLine(message: string): void {
        console.log(message);
        return;
    }
    public writeObject(data: unknown): void {
        console.dir(data);
        return;
    }
}