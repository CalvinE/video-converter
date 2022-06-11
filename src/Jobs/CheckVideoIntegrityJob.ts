import { CheckVideoIntegrityJobOptions, CheckVideoIntegrityJobResult, getCommandID } from '../VideoConverter/models';
import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager/FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter/models';
import { BaseJob } from './BaseJob';

export const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;

export const CHECK_VIDEO_INTEGRITY_JOB_NAME = "checkVideoIntegrity";

export class CheckVideoIntegrityJob extends BaseJob<CheckVideoIntegrityJobOptions, CheckVideoIntegrityJobResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: CheckVideoIntegrityJobOptions) {
        super(logger, outputWriter, fileManager, options);
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }

    public getJobTypeName(): string {
        return CHECK_VIDEO_INTEGRITY_JOB_NAME;
    }

    protected _handleJobFailureCleanup(): void {
        delete this._jobOptions.result?.CheckVideoIntegrityCommandResult;
        delete this._jobOptions.result?.failureReason;
    }

    protected async _execute(): Promise<CheckVideoIntegrityJobResult> {
        this._outputWriter.writeLine(`checking video integrity of: ${this.GetSourceFileInfo().fullPath}`);
        const ffmpegCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, "", this._jobOptions.baseCommand);
        const commandID = getCommandID(this.GetJobTaskName());
        const checkVideoIntegrityCommandResult = await ffmpegCommand.checkVideoIntegrity(this.GetSourceFileInfo(), this._jobOptions.jobID, commandID, {
            timeoutMilliseconds: this._jobOptions.commandOptions.timeoutMilliseconds,
            xArgs: this._jobOptions.commandOptions.xArgs,
        });
        if (checkVideoIntegrityCommandResult.integrityCheck.isVideoGood === false
            && this._jobOptions.deleteFailedIntegrityCheckFiles === true) {
            const deleted = this._fileManager.safeUnlinkFile(this.GetSourceFileInfo().fullPath);
            if (deleted === true) {
                const msg = "file deleted because it failed the integrity check";
                this._logger.LogWarn(msg, { checkVideoIntegrityCommandResult, deleteFailedIntegrityCheckFiles: this._jobOptions.deleteFailedIntegrityCheckFiles });
                this._outputWriter.writeLine(msg);
            } else {
                const msg = "invalid file delete failed";
                this._logger.LogWarn(msg, { checkVideoIntegrityCommandResult, deleteFailedIntegrityCheckFiles: this._jobOptions.deleteFailedIntegrityCheckFiles });
                this._outputWriter.writeLine(msg);
            }
        }
        return {
            durationMilliseconds: checkVideoIntegrityCommandResult.durationMilliseconds,
            durationPretty: checkVideoIntegrityCommandResult.durationPretty,
            integrityCheck: checkVideoIntegrityCommandResult.integrityCheck,
            jobID: this._jobOptions.jobID,
            success: checkVideoIntegrityCommandResult.success,
            skipped: false,
            failureReason: checkVideoIntegrityCommandResult.failureReason,
            fileInfo: checkVideoIntegrityCommandResult.fileInfo,
            videoInfo: checkVideoIntegrityCommandResult.videoInfo,
            CheckVideoIntegrityCommandResult: checkVideoIntegrityCommandResult.success === false ? undefined : {
                commandID: commandID,
                durationMilliseconds: checkVideoIntegrityCommandResult.durationMilliseconds,
                durationPretty: checkVideoIntegrityCommandResult.durationPretty,
                statusCode: checkVideoIntegrityCommandResult.statusCode,
                success: checkVideoIntegrityCommandResult.success,
                commandErrOutput: checkVideoIntegrityCommandResult.commandErrOutput,
                commandStdOutput: checkVideoIntegrityCommandResult.commandStdOutput,
                failureReason: checkVideoIntegrityCommandResult.failureReason,
            }
        };
    }

}
