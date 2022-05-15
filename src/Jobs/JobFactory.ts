// import { IFileManager } from '../FileManager';
// import { ILogger } from '../Logger';
// import { IOutputWriter } from '../OutputWriter';
// import { BaseJobOptions } from '../VideoConverter/models';
// import { BaseJob, IJob } from './BaseJob';

// export class JobFactory {
//     private static jobRegistry: Record<string, IJob> = {};

//     public static registerJob(jobName: string, c: IJob) {
//         JobFactory.jobRegistry[jobName] = c;
//     }

//     public static MakeJob(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: BaseJobOptions): IJob {
//         const ctor = JobFactory.jobRegistry[options.task];
//         return new ctor(logger, outputWriter, fileManager, options);
//     }
// }
