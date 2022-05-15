import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { ConvertJobOptions, VideoConvertResult } from './../VideoConverter/models';
import { BaseJob } from "./BaseJob";

export class ConvertVideoJob extends BaseJob<ConvertJobOptions, VideoConvertResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: ConvertJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }
    protected _execute(): Promise<VideoConvertResult> {
        throw new Error('Method not implemented.');
    }

}
