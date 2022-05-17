import { CheckVideoIntegrityJobOptions, CheckVideoIntegrityResult } from '../VideoConverter/models';
import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter/models';
import { BaseJob } from './BaseJob';

export const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;

export class CheckVideoIntegrityJob extends BaseJob<CheckVideoIntegrityJobOptions, CheckVideoIntegrityResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: CheckVideoIntegrityJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }

    protected async _execute(): Promise<CheckVideoIntegrityResult> {
        this._outputWriter.writeLine(`checking video integrity of: ${this._jobOptions.fileInfo.fullPath}`);
        const ffmpegCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, "", this._jobOptions.baseCommand);
        const details = await ffmpegCommand.checkVideoIntegrity(this._jobOptions.fileInfo, {
            commandID: this._jobOptions.commandID,
            timeoutMilliseconds: this._jobOptions.options.timeoutMilliseconds,
            xArgs: this._jobOptions.options.xArgs,
        });
        return details;
    }

}
