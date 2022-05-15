import { FileInfo, IFileManager } from './../FileManager';
import { BaseJobOptions, BaseJobResult } from './../VideoConverter/models';
import { IOutputWriter } from './../OutputWriter';
import { ILogger } from "../Logger";

export interface IJob {
    // new(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, jobOptions: BaseJobOptions): BaseJob<BaseJobOptions, BaseJobResult>;
    execute(): Promise<BaseJobResult>;
}

/**
 * The idea here is to abstract the individual jobs in a job file to this class.
 * The class will call commands that will do what they need to do.
 * In essence the code for running specific command types will be in these classes.
 * TODO: additionally I will need to make an abstract factory for these based on task name?
 */
export abstract class BaseJob<O extends BaseJobOptions, R extends BaseJobResult> {

    protected _logger: ILogger;
    protected _outputWriter: IOutputWriter;
    protected _fileManager: IFileManager;
    protected _jobOptions: O;

    public success: boolean;
    public durationMilliseconds: number;
    public sizeBytesChange: number;
    public sourceFile: FileInfo;
    public targetFile?: FileInfo;

    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, jobOptions: O) {
        this._logger = logger;
        this._outputWriter = outputWriter;
        this._fileManager = fileManager
        this._jobOptions = jobOptions;
        this.success = false;
        this.durationMilliseconds = 0;
        this.sizeBytesChange = 0;
        this.sourceFile = jobOptions.fileInfo;
    }

    public abstract validateJobOptions(): boolean

    protected abstract _execute(): Promise<R>;

    public async execute(): Promise<R> {
        const result = await this._execute();
        return result;
    }

    public GetJobTaskName(): string {
        return this._jobOptions.task;
    }

    public GetSourceFileInfo(): FileInfo {
        return this._jobOptions.fileInfo;
    }

}
