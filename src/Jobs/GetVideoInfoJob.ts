import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter/models';
import { GetInfoJobOptions, GetVideoInfoResult } from '../VideoConverter/models';
import { BaseJob } from './BaseJob';

export const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;

export class GetVideoInfoJob extends BaseJob<GetInfoJobOptions, GetVideoInfoResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: GetInfoJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }

    protected async _execute(): Promise<GetVideoInfoResult> {
        this._outputWriter.writeLine(`getting file info: ${this._jobOptions.fileInfo.fullPath}`);
        const ffmpegCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, "", this._jobOptions.baseCommand);
        const details = await ffmpegCommand.getVideoInfo(this._jobOptions.fileInfo, {
            commandID: this._jobOptions.commandID,
            timeoutMilliseconds: this._jobOptions.options.timeoutMilliseconds,
            xArgs: this._jobOptions.options.xArgs,
        });
        return details;
    }

}
