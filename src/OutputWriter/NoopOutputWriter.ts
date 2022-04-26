import { IOutputWriter } from './models';

export class NoopOutputWriter implements IOutputWriter {
    supportsProgressiveUpdates(): boolean {
        return false;
    }
    initialize(): Promise<void> {
        return Promise.resolve();
    }
    write(): void {
        return;
    }
    writeLine(): void {
        return;
    }
    writeObject(): void {
        return;
    }
    shutdown(): Promise<void> {
        return Promise.resolve();
    }

}