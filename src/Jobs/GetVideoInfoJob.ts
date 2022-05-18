import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter/models';
import { getCommandID, GetInfoJobOptions, GetVideoInfoJobResult } from '../VideoConverter/models';
import { BaseJob } from './BaseJob';

export const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
export const GET_VIDEO_INFO_JOB_NAME = "getVideoInfo";

export class GetVideoInfoJob extends BaseJob<GetInfoJobOptions, GetVideoInfoJobResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: GetInfoJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }

    public getJobTypeName(): string {
        return GET_VIDEO_INFO_JOB_NAME;
    }

    protected async _execute(): Promise<GetVideoInfoJobResult> {
        this._outputWriter.writeLine(`getting file info: ${this._jobOptions.fileInfo.fullPath}`);
        const ffmpegCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, "", this._jobOptions.baseCommand);
        const commandID = getCommandID(this._jobOptions.task);
        const details = await ffmpegCommand.getVideoInfo(this._jobOptions.fileInfo, this._jobOptions.jobID, commandID, {
            timeoutMilliseconds: this._jobOptions.commandOptions.timeoutMilliseconds,
            xArgs: this._jobOptions.commandOptions.xArgs,
        });
        return {
            success: details.success,
            durationMilliseconds: details.durationMilliseconds,
            durationPretty: details.durationPretty,
            jobID: this._jobOptions.jobID,
            fileInfo: details.fileInfo,
            videoInfo: details.videoInfo,
            failureReason: details.failureReason,
            getVideoInfoCommandResult: details.success === true ? undefined : {
                commandID: commandID,
                durationMilliseconds: details.durationMilliseconds,
                durationPretty: details.durationPretty,
                statusCode: details.statusCode,
                success: details.success,
                commandErrOutput: details.commandErrOutput,
                commandStdOutput: details.commandStdOutput,
                failureReason: details.failureReason,
            }
        };
    }

}
