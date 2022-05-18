import { CopyJobResult } from './../VideoConverter/models';
import { ILogger } from "../Logger";
import { CopyJobOptions } from "../VideoConverter/models";
import { BaseJob } from "./BaseJob";
import { IOutputWriter } from '../OutputWriter';
import { FileInfo, IFileManager } from '../FileManager';
import { millisecondsToHHMMSS } from '../PrettyPrint';

export const COPY_JOB_NAME = "copy";

export class CopyJob extends BaseJob<CopyJobOptions, CopyJobResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: CopyJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }

    public getJobTypeName(): string {
        return COPY_JOB_NAME;
    }

    protected _execute(): Promise<CopyJobResult> {
        return new Promise((resolve) => {
            const start = Date.now();
            const sourceFile = this._jobOptions.fileInfo.fullPath;
            const targetFile = this._jobOptions.fileInfo.fullPath;
            this._outputWriter.writeLine(`copying file: ${sourceFile} => ${targetFile}`);
            const success = this._fileManager.copyFile(sourceFile, targetFile);
            let targetFileInfo: FileInfo | undefined;
            if (success === true) {
                targetFileInfo = (this._fileManager.getFSItemFromPath(targetFile) as FileInfo);
            }
            const end = Date.now();
            const duration = end - start;
            resolve({
                jobID: this._jobOptions.jobID,
                durationMilliseconds: duration,
                durationPretty: millisecondsToHHMMSS(duration),
                sourceFileInfo: this._jobOptions.fileInfo,
                success,
                targetFileInfo,
                failureReason: undefined, // This will throw an error if it fails?
            });
        });
    }

}