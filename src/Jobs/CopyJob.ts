import { CopyJobResult } from './../VideoConverter/models';
import { ILogger } from "../Logger";
import { CopyJobOptions } from "../VideoConverter/models";
import { BaseJob } from "./BaseJob";
import { IOutputWriter } from '../OutputWriter';
import { FileInfo, IFileManager } from '../FileManager/FileManager';
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

    protected _handleJobFailureCleanup(): void {
        const targetFileFullPath = this._jobOptions.targetFileFullPath;
        if (targetFileFullPath !== "") {
            this._outputWriter.writeLine(`attempting to delete target file if it exists ${targetFileFullPath}`);
            this._fileManager.safeUnlinkFile(targetFileFullPath);
            if (this._fileManager.exists(targetFileFullPath)) {
                this._logger.LogWarn("failed to clean up failed job data", { targetFileFullPath });
                this._outputWriter.writeLine(`failed to clean up failed job data ${targetFileFullPath}`);
            } else {
                this._logger.LogInfo("successfully removed failed job file data", { targetFileFullPath });
                this._outputWriter.writeLine(`successfully removed failed job file data`);
            }
        }
    }

    protected _execute(): Promise<CopyJobResult> {
        return new Promise((resolve) => {
            const start = Date.now();
            const sourceFile = this.GetSourceFileInfo().fullPath;
            const targetFile = this._jobOptions.targetFileFullPath;
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
                skipped: false,
                durationMilliseconds: duration,
                durationPretty: millisecondsToHHMMSS(duration),
                sourceFileInfo: this.GetSourceFileInfo(),
                success,
                targetFileInfo,
                failureReason: undefined, // This will throw an error if it fails?
            });
        });
    }

}