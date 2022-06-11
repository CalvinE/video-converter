import { WriteStream, createWriteStream } from 'fs';
import { EOL } from 'os';
import { IFileManager } from '../FileManager/FileManager';
import { IOutputWriter } from './models';

export class FileOutputWriter implements IOutputWriter {

    private _outputFilePath: string;
    private _fileManager: IFileManager;
    private _fileWriter: WriteStream;

    constructor(outputFilePath: string, fileManager: IFileManager) {
        this._outputFilePath = outputFilePath;
        this._fileManager = fileManager;
        this._fileManager.makeDir(this._outputFilePath);
        this._fileWriter = createWriteStream(this._outputFilePath, {
            encoding: "utf8",
        });
    }

    public supportsProgressiveUpdates(): boolean {
        return false;
    }

    public initialize(): Promise<void> {
        return Promise.resolve();
    }

    public write(message: string): void {
        this._fileWriter.write(message);
        return;
    }

    public writeLine(message: string): void {
        this._fileWriter.write(`${message}${EOL}`);
        return;
    }

    public writeObject(data: unknown): void {
        const dataString = JSON.stringify(data);
        this._fileWriter.write(`${dataString}${EOL}`);
        return;
    }

    public shutdown(): Promise<void> {
        return new Promise((resolve) => {
            this._fileWriter.close(() => {
                resolve();
            });
        });
    }

}