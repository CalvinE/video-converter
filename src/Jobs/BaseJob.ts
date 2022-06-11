import { FileInfo, IFileManager } from '../FileManager/FileManager';
import { BaseJobOptions, BaseCommandResult, BaseJobResult, Task } from './../VideoConverter/models';
import { IOutputWriter } from './../OutputWriter';
import { ILogger } from "../Logger";

export interface IJob {
    // new(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, jobOptions: BaseJobOptions): BaseJob<BaseJobOptions, BaseJobResult>;
    execute(): Promise<BaseCommandResult>;
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

    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, jobOptions: O) {
        this._logger = logger;
        this._outputWriter = outputWriter;
        this._fileManager = fileManager;
        this._jobOptions = jobOptions;
        this.success = false;
        this.durationMilliseconds = 0;
        this.sizeBytesChange = 0;
    }

    public abstract validateJobOptions(): boolean

    public abstract getJobTypeName(): string;

    protected abstract _execute(): Promise<R>;

    public async execute(): Promise<R> {
        const result = await this._execute();
        return result;
    }

    protected abstract _handleJobFailureCleanup(): void;

    public handleJobFailureCleanup() {
        delete this._jobOptions.failureReason;
        this._handleJobFailureCleanup();
    }

    public GetJobTaskName(): Task {
        return this._jobOptions.task;
    }

    public GetSourceFileInfo(): FileInfo {
        return this._jobOptions.sourceFileInfo;
    }

    public GetJobID(): string {
        return this._jobOptions.jobID;
    }

}
