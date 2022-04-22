export type LogLevel = "verbose" | "debug" | "info" | "warn" | "error";

const LogLevelCodes: Record<LogLevel, number> = {
    "verbose": -1,
    "debug": 0,
    "info": 1,
    "warn": 2,
    "error": 3,
}

export abstract class BaseStructuredLogger implements ILogger {
    private _minLogLevel: LogLevel;
    private _minLogLevelCode: number;

    constructor(minLogLevel: LogLevel) {
        this._minLogLevel = minLogLevel;
        // If you pass a bad log level we drop the min so all messages are logged.
        this._minLogLevelCode = LogLevelCodes[this._minLogLevel] ?? -1
    }

    private shouldLog(level: LogLevel): boolean {
        // If you pass a bad log level then we up the priority...
        return (LogLevelCodes[level] ?? 9) >= this._minLogLevelCode;
    }

    protected abstract internalLogMessage(logObject: Record<string, unknown>): void;

    public abstract shutdown(): Promise<void>;

    private LogMessage(level: LogLevel, message: string, data: Record<string, unknown>) {
        if (this.shouldLog(level)) {
            const now = new Date();
            const logData = {
                ...data,
                message,
                level,
                timestamp: now.toISOString(),
            };
            this.internalLogMessage(logData);
        }
    }

    public LogVerbose(message: string, data: Record<string, unknown>) {
        this.LogMessage("verbose", message, data);
    }

    public LogDebug(message: string, data: Record<string, unknown>) {
        this.LogMessage("debug", message, data);
    }

    public LogInfo(message: string, data: Record<string, unknown>) {
        this.LogMessage("info", message, data);
    }

    public LogWarn(message: string, data: Record<string, unknown>) {
        this.LogMessage("warn", message, data);
    }

    public LogError(message: string, err: Error, data: Record<string, unknown>) {
        const dataWithErr = {
            ...data,
            error: {
                message: err.message,
                name: err.name,
                stack: err.stack,
            },
        }
        this.LogMessage("error", message, dataWithErr);
    }

}

export interface ILogger {
    LogVerbose: (message: string, data: Record<string, unknown>) => void;
    LogDebug: (message: string, data: Record<string, unknown>) => void;
    LogInfo: (message: string, data: Record<string, unknown>) => void;
    LogWarn: (message: string, data: Record<string, unknown>) => void;
    LogError: (message: string, err: Error, data: Record<string, unknown>) => void;
}