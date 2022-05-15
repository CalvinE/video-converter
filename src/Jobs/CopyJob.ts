import { CopyResult } from './../VideoConverter/models';
import { ILogger } from "../Logger";
import { CopyJobOptions } from "../VideoConverter/models";
import { BaseJob } from "./BaseJob";
import { IOutputWriter } from '../OutputWriter';
import { FileInfo, IFileManager } from '../FileManager';
import { millisecondsToHHMMSS } from '../PrettyPrint';

export class CopyJob extends BaseJob<CopyJobOptions, CopyResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: CopyJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }
    protected _execute(): Promise<CopyResult> {
        return new Promise((resolve) => {
            const start = Date.now();
            const sourceFile = this._jobOptions.fileInfo.fullPath;
            const targetFile = this._jobOptions.fileInfo.fullPath;
            this._outputWriter.writeLine(`copying file: ${sourceFile} => ${targetFile}`);
            const success = this._fileManager.copyFile(sourceFile, targetFile);
            let targetFileInfo: FileInfo | undefined;
            let statusCode = -1;
            if (success === true) {
                statusCode = 0;
                targetFileInfo = (this._fileManager.getFSItemFromPath(targetFile) as FileInfo);
            }
            const end = Date.now();
            const duration = end - start;
            resolve({
                commandID: this._jobOptions.commandID,
                duration,
                durationPretty: millisecondsToHHMMSS(duration),
                statusCode,
                success,
                targetFileInfo,
            });
        });
    }

}