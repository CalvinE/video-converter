import { CheckVideoIntegrityJob, CHECK_VIDEO_INTEGRITY_JOB_NAME } from './CheckVideoIntegrityJob';
import { CopyJobOptions, GetInfoJobOptions, ConvertJobOptions, CheckVideoIntegrityJobOptions, Task, JobOptions, getJobID, VideoConvertCommandOptions, GetVideoInfoCommandOptions, CheckVideoIntegrityCommandOptions } from './../VideoConverter/models';
import { FileInfo, IFileManager } from '../FileManager/FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { BaseJobOptions } from '../VideoConverter/models';
import { ConvertVideoJob, CONVERT_VIDEO_JOB_NAME } from './ConvertVideoJob';
import { CopyJob, COPY_JOB_NAME } from './CopyJob';
import { GetVideoInfoJob, GET_VIDEO_INFO_JOB_NAME } from './GetVideoInfoJob';
import { AppOptions } from '../OptionsParser';
import { join, resolve } from 'path';

/**
 * This token is prepended on file names at job creation time when a source and target file for conversion are the same (full path and file name). This is automatically removed from the file name when the conversion is complete and will overwrite the original if it is still in place post conversion.
 */
export const TEMP_FILE_PREFIX = ")_-_-VCTMP-_-_(";

export class SourceTargetCollisionError extends Error {
    constructor() {
        super();
        this.message = "source and target for job are the same and settings are such that it is not allowed";
    }
}

type Job = CopyJob | ConvertVideoJob | GetVideoInfoJob | CheckVideoIntegrityJob;

// FIXME: make this work from an object for key to job constructors. add ability to register new jobs at run time?
export class JobFactory {
    public static makeJob(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: BaseJobOptions): Job {
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

    public static makeJobOptions(logger: ILogger, task: Task, sourceFileInfo: FileInfo, appOptions: AppOptions): JobOptions {
        logger.LogVerbose(`making job of type ${task}`, { sourceFileInfo, appOptions, task });
        if (task === "convert") {
            const targetFileFullPath = this._getTargetFileFullPath(logger, sourceFileInfo, appOptions).targetFileFullPath;
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
            const getVideoInfoCommandOptions: CheckVideoIntegrityCommandOptions = {
                timeoutMilliseconds: appOptions.getVideoInfoTimeoutMilliseconds,
                xArgs: [],
            };
            return {
                baseCommand: appOptions.ffmpegCommand,
                getInfoCommand: appOptions.ffprobeCommand,
                deleteSourceAfterConvert: appOptions.deleteSourceAfterConvert,
                jobID,
                keepInvalidConvertResult: appOptions.keepInvalidConvertResult,
                allowClobberExisting: appOptions.convertVideoAllowClobber,
                skipConvertExisting: appOptions.convertVideoSkipConvertExisting,
                skipVideoCodecName: appOptions.skipIfVideoCodecNameMatch,
                sourceFileInfo: sourceFileInfo,
                host: "local",
                state: "pending",
                task: "convert",
                commandOptions: videoConvertOptions,
                checkVideoIntegrityCommandOptions: getVideoInfoCommandOptions,
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
                sourceFileInfo: sourceFileInfo,
                host: "local",
                state: "pending",
                task: "getinfo",
                commandOptions: getVideoInfoOptions,
            } as GetInfoJobOptions;
        } else if (task === "copy") {
            const targetFileFullPath = this._getTargetFileFullPath(logger, sourceFileInfo, appOptions).targetFileFullPath;
            const jobID = getJobID(COPY_JOB_NAME);
            return {
                jobID,
                sourceFileInfo: sourceFileInfo,
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
                sourceFileInfo: sourceFileInfo,
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
            fileInfo: sourceFileInfo,
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
            absoluteParentPath = sourceFile.pathToItem;
            logger.LogDebug("save in place options set. using source file path", { sourceFileFullPath: sourceFile.fullPath });
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

        let targetFileFullPath = join(absoluteParentPath, targetFileName);

        if (targetFileFullPath === sourceFile.fullPath) {
            if (options.saveInPlace && options.deleteSourceAfterConvert) {
                targetFileFullPath = join(absoluteParentPath, `${TEMP_FILE_PREFIX}${targetFileName}`);
            } else {
                const err = new SourceTargetCollisionError();
                logger.LogError("cannot proceed source and target path are identical and based on settings that is not allowed...", err, { path: targetFileName })
                throw err;
            }
        }

        logger.LogDebug("target file location built", { sourceFile, absoluteParentPath, targetFileFullPath: targetFileName, });
        return {
            absoluteParentPath,
            targetFileFullPath,
        };
    }

}
