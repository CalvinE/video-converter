import { BaseStructuredLogger, LogLevel } from './Logger';

export class PrettyJSONConsoleLogger extends BaseStructuredLogger {
    
    constructor(minLogLevel: LogLevel) {
        super(minLogLevel);
    }
    
    public shutdown(): Promise<void> {
        return Promise.resolve();
    }
    
    protected internalLogMessage(logObject: Record<string, unknown>): void {
        console.dir(logObject);
    }
}