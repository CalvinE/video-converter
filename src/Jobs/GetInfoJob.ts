import { IFileManager } from './../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from './../OutputWriter/models';
import { GetInfoJobOptions, VideoGetInfoResult } from './../VideoConverter/models';
import { BaseJob } from './BaseJob';

export class GetInfoJob extends BaseJob<GetInfoJobOptions, VideoGetInfoResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: GetInfoJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }
    protected _execute(): Promise<VideoGetInfoResult> {
        throw new Error('Method not implemented.');
    }

}
