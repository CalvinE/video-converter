import { CopyResult } from './../VideoConverter/models';
import { ILogger } from "../Logger";
import { CopyJobOptions } from "../VideoConverter/models";
import { BaseJob } from "./BaseJob";
import { IOutputWriter } from '../OutputWriter';
import { IFileManager } from '../FileManager';

export class CopyJob extends BaseJob<CopyJobOptions, CopyResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: CopyJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }
    protected _execute(): Promise<CopyResult> {
        throw new Error('Method not implemented.');
    }

}