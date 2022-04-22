import { BaseStructuredLogger, LogLevel } from './Logger';
import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export class FileLogger extends BaseStructuredLogger {
    private _writeStream: WriteStream;
    private _stringifySpaces: number;
    public fullLogFilePath: string;

    constructor(minLogLevel: LogLevel, logFilePath: string, pretty: boolean) {
        super(minLogLevel);
        if (!existsSync(logFilePath)) {
            mkdirSync(logFilePath, {
                recursive: true
            });
        }
        const now = new Date();
        const year = now.getFullYear();
        const month = `${now.getMonth() + 1}`.padStart(2, '0');
        const day =`${now.getDate()}`.padStart(2, '0');
        const hour = `${now.getHours()}`.padStart(2, '0');
        const minute = `${now.getMinutes()}`.padStart(2, '0');
        const second = `${now.getSeconds()}`.padStart(2, '0');
        // const millisecond = `${now.getMilliseconds()}`.padStart(2, '0');
        const logFileName = `${year}${month}${day}${hour}${minute}${second}-video-converter.log`;
        this.fullLogFilePath = resolve(join(logFilePath, logFileName));
        this._writeStream = createWriteStream(this.fullLogFilePath, {
            encoding: "utf8",
        });
        this._stringifySpaces = pretty ? 2 : 0;
    }

    
    
    public shutdown(): Promise<void> {
        return new Promise((resolve) => {
            this._writeStream.end(() => {
                resolve();
            })
        });
    }

    protected internalLogMessage(logObject: Record<string, unknown>): void {
        const logObjString = JSON.stringify(logObject, null, this._stringifySpaces);
        this._writeStream.write(logObjString);
    }
}