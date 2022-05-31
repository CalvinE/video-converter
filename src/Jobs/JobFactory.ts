import { CheckVideoIntegrityJob, CHECK_VIDEO_INTEGRITY_JOB_NAME } from './CheckVideoIntegrityJob';
import { CopyJobOptions, GetInfoJobOptions, ConvertJobOptions, CheckVideoIntegrityJobOptions, Task, JobOptions, getJobID, VideoConvertCommandOptions, GetVideoInfoCommandOptions } from './../VideoConverter/models';
import { FileInfo, IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { BaseJobOptions } from '../VideoConverter/models';
import { ConvertVideoJob, CONVERT_VIDEO_JOB_NAME } from './ConvertVideoJob';
import { CopyJob, COPY_JOB_NAME } from './CopyJob';
import { GetVideoInfoJob, GET_VIDEO_INFO_JOB_NAME } from './GetVideoInfoJob';
import { AppOptions } from '../OptionsParser';
import { join, resolve } from 'path';

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

    public static makeJobOptions(logger: ILogger, task: Task, fileInfo: FileInfo, appOptions: AppOptions): JobOptions {
        logger.LogVerbose(`making job of type ${task}`, { fileInfo, appOptions, task });
        if (task === "convert") {
            const targetFileFullPath = this._getTargetFileFullPath(logger, fileInfo, appOptions).targetFileFullPath;
            const jobID = getJobID(CONVERT_VIDEO_JOB_NAME);
            const videoConvertOptions: VideoConvertCommandOptions = {
                useCuda: appOptions.useCuda,
                timeoutMilliseconds: appOptions.convertVideoTimeoutMilliseconds,
                targetAudioEncoding: appOptions.targetAudioEncoder,
                targetVideoEncoding: appOptions.targetVideoEncoder,
                targetContainerFormat: appOptions.targetContainerFormat,
                targetFileFullPath: targetFileFullPath,
                xArgs: appOptions.xArgs,
            };
            const getVideoInfoCommandOptions: GetVideoInfoCommandOptions = {
                timeoutMilliseconds: appOptions.getVideoInfoTimeoutMilliseconds,
                xArgs: [],
            };
            return {
                baseCommand: appOptions.ffmpegCommand,
                getInfoCommand: appOptions.ffprobeCommand,
                saveInPlace: appOptions.saveInPlace,
                jobID,
                keepInvalidConvertResult: appOptions.keepInvalidConvertResult,
                allowClobberExisting: appOptions.convertVideoAllowClobber,
                skipConvertExisting: appOptions.convertVideoSkipConvertExisting,
                fileInfo,
                host: "local",
                state: "pending",
                task: "convert",
                commandOptions: videoConvertOptions,
                getVideoInfoCommandOptions,
            } as ConvertJobOptions;
        } else if (task === "getinfo") {
            const jobID = getJobID(GET_VIDEO_INFO_JOB_NAME);
            const getVideoInfoOptions: GetVideoInfoCommandOptions = {
                timeoutMilliseconds: appOptions.getVideoInfoTimeoutMilliseconds,
                xArgs: appOptions.xArgs,
            };
            return {
                baseCommand: appOptions.ffprobeCommand,
                jobID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "getinfo",
                commandOptions: getVideoInfoOptions,
            } as GetInfoJobOptions;
        } else if (task === "copy") {
            const targetFileFullPath = this._getTargetFileFullPath(logger, fileInfo, appOptions).targetFileFullPath;
            const jobID = getJobID(COPY_JOB_NAME);
            return {
                jobID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "copy",
                targetFileFullPath,
            } as CopyJobOptions;
        } else if (task === "checkvideointegrity") {
            const jobID = getJobID(CHECK_VIDEO_INTEGRITY_JOB_NAME);
            return {
                baseCommand: appOptions.ffprobeCommand,
                jobID,
                fileInfo,
                deleteFailedIntegrityCheckFiles: appOptions.deleteFailedIntegrityCheckFiles,
                host: "local",
                state: "pending",
                task: "checkvideointegrity",
                commandOptions: {
                    timeoutMilliseconds: appOptions.getVideoInfoTimeoutMilliseconds,
                    xArgs: [],
                }
            } as CheckVideoIntegrityJobOptions;
        }
        const error = new Error(`invalid task type encountered: ${task}`)
        logger.LogError("invalid task type provided", error, {
            task,
            fileInfo,
            options: appOptions,
        });
        throw error;
    }

    private static _getTargetFileFullPath(logger: ILogger, sourceFile: FileInfo, options: AppOptions): {
        absoluteParentPath: string,
        targetFileFullPath: string
    } {
        let absoluteParentPath: string;
        logger.LogVerbose("attempting to build target file full path", { source: sourceFile, options });
        if (options.saveInPlace) {
            absoluteParentPath = sourceFile.fullPath;
            logger.LogDebug("save in place options set. using source file full path", { sourceFileFullPath: sourceFile.fullPath });
        } else if (options.copyRelativeFolderPath) {
            const fullRelativePath = join(options.savePath, sourceFile.relativePath);
            absoluteParentPath = resolve(fullRelativePath);
            logger.LogDebug("using options save path and source file relative path for target file path", { absoluteParentPath });
        } else {
            absoluteParentPath = resolve(options.savePath);
            logger.LogDebug("using options save path for target file path", { absoluteParentPath });
        }

        let targetFileName: string;
        if (options.targetContainerFormat === "copy") {
            targetFileName = sourceFile.name;
            logger.LogDebug("option target container format is set to copy, so we are not changing the extension", {});
        } else {
            let targetContainerFormat = options.targetContainerFormat;
            if (targetContainerFormat.startsWith(".")) {
                targetContainerFormat = targetContainerFormat.substring(1);
            }
            // FIXME: validate the target file container extension?
            targetFileName = `${sourceFile.name.substring(0, sourceFile.name.lastIndexOf("."))}.${targetContainerFormat}`;
            logger.LogDebug("using option target container format on file name", { targetFileName: targetFileName, targetContainerFormat: options.targetContainerFormat });
        }

        const targetFileFullPath = join(absoluteParentPath, targetFileName);
        logger.LogDebug("target file location built", { sourceFile, absoluteParentPath, targetFileFullPath: targetFileName, });
        return {
            absoluteParentPath,
            targetFileFullPath,
        };
    }

}
