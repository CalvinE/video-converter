import { BaseStructuredLogger } from "./Logger";

export class NoopLogger extends BaseStructuredLogger {
    protected internalLogMessage(): void {
        return;
    }
    public shutdown(): Promise<void> {
        return Promise.resolve();
    }

}