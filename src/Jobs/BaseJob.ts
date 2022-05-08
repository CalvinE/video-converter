import { IOutputWriter } from './../OutputWriter';
import { ILogger } from "../Logger";

/**
 * The idea here is to abstract the individual jobs in a job file to this class.
 * The class will call commands that will do what they need to do.
 * In essence the code for running specific command types will be in these classes.
 * TODO: additionally I will need to make an abstract factory for these based on task name?
 */
export abstract class BaseJob<T> { // TODO: have a base job options thing T must extend?

    protected _logger: ILogger;
    protected _outputWriter: IOutputWriter;
    constructor(logger: ILogger, outputWriter: IOutputWriter) {
        this._logger = logger;
        this._outputWriter = outputWriter;
    }

    public abstract execute(): Promise<T>;
}
