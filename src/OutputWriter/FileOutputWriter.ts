import { WriteStream, createWriteStream } from 'fs';
import { EOL } from 'os';
import { IFileManager } from './../FileManager';
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

    public initialize(): Promise<void> {
        return Promise.resolve();
    }

    public writeString(message: string): Promise<void> {
        this._fileWriter.write(`${message}${EOL}`);
        return Promise.resolve();
    }

    public writeObject(data: unknown): Promise<void> {
        const dataString = JSON.stringify(data);
        this._fileWriter.write(`${dataString}${EOL}`);
        return Promise.resolve();
    }

    public shutdown(): Promise<void> {
        return new Promise((resolve) => {
            this._fileWriter.close(() => {
                resolve();
            })
        })
    }

}