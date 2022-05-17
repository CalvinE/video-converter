import { CheckVideoIntegrityJob } from './CheckVideoIntegrityJob';
import { CopyJobOptions, GetInfoJobOptions, ConvertJobOptions, CheckVideoIntegrityJobOptions } from './../VideoConverter/models';
import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { BaseJobOptions } from '../VideoConverter/models';
import { ConvertVideoJob } from './ConvertVideoJob';
import { CopyJob } from './CopyJob';
import { GetVideoInfoJob } from './GetVideoInfoJob';

type Job = CopyJob | ConvertVideoJob | GetVideoInfoJob | CheckVideoIntegrityJob;

// FIXME: make this work from an object for key to job constructors. add ability to register new jobs at run time?
export class JobFactory {
    public static MakeJob(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: BaseJobOptions): Job {
        switch (options.task) {
            case "copy":
                return new CopyJob(logger, outputWriter, fileManager, options as CopyJobOptions);
            case "getinfo":
                return new GetVideoInfoJob(logger, outputWriter, fileManager, options as GetInfoJobOptions)
            case "convert":
                return new ConvertVideoJob(logger, outputWriter, fileManager, options as ConvertJobOptions);
            case "checkvideointegrity":
                return new CheckVideoIntegrityJob(logger, outputWriter, fileManager, options as CheckVideoIntegrityJobOptions);
            default:
                throw new Error("invalid job type...");
        }
    }
}
