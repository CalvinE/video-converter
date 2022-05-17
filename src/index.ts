import { JobFactory } from './Jobs/JobFactory';
import {
    IJobFileManager,
    JobFileManager
} from './JobFileManager';
import {
    basename,
    extname,
    join,
    resolve
} from 'path';
import {
    VideoConvertOptions,
    GetVideoInfoOptions,
    Task,
    getJobCommandID,
    SubCommand,
    INVALID,
    JobsOptionsArray,
    getJobID,
    JobFile,
    JobOptions,
    ConvertVideoResult,
    GetVideoInfoResult,
    CopyResult,
    CheckVideoIntegrityResult,
    CheckVideoIntegrityJobOptions,
    CopyJobOptions,
    ConvertJobOptions,
    GetInfoJobOptions
} from './VideoConverter/models';
import {
    IOutputWriter
} from './OutputWriter/models';
import {
    ConsoleOutputWriter
} from './OutputWriter/ConsoleOutputWriter';
import {
    FileManager,
    FSItem,
    FileInfo
} from './FileManager';
import {
    FileLogger,
    ILogger
} from './Logger';
import {
    FFMPEGVideoConverter
} from './VideoConverter';
import {
    AppOptions,
    ParseOptions,
    PrintHelp
} from './OptionsParser';
import {
    bytesToHumanReadableBytes,
    millisecondsToHHMMSS
} from './PrettyPrint';

const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
const CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS = 0;

const WRITE_PRETTY_JOB_FILE = true;

const FFMPEG_COMMAND = "ffmpeg";
const FFPROBE_COMMAND = "ffprobe";



/* 
    TODO: list
    * add better option for specifying additional options for a command?
    * allow a prefix / suffix to be added to converted files.
    * make a sweet CSI driven display for running jobs.
    * clean up output writer and logger output.
    * add support for multiple jobs simultaneously? Or have a job orchestrator that can push individual jobs to clients waiting for work?
    * make a function to create output folders, so the parent directory is all in one place...
    * Improve code here so there is not so much in one place to try and read...
    * handle signals to cancel the command properly like ???
    * Have a file name alteration function replace certain string with others, etc...
    * write *better* help info...
    * add log file directory as parameter
    * fix potential issue in options parser where there may be only one arg before options...
    * fix job file manager so that it can have a whole job file written to it post construction.
    * add handler for circumstance where we skip files if nothing will be changed for instance video and audio and container are all copy.
*/

(async function () {
    let appOptions: AppOptions = ParseOptions();
    // const logger: ILogger = new PrettyJSONConsoleLogger("verbose");
    const appLogger: ILogger = new FileLogger("info", join(".", "output", "logs"), true);
    appLogger.LogDebug("application starting", { appOptions })
    const appOutputWriter: IOutputWriter = new ConsoleOutputWriter();
    await appOutputWriter.initialize()
    const fileManager = new FileManager(appLogger);

    const jobFileFullPath = resolve(appOptions.jobFile);

    const ffmpegVideoConverter = new FFMPEGVideoConverter(appLogger, fileManager, FFMPEG_COMMAND, FFPROBE_COMMAND);
    try {
        if (appOptions.help === true) {
            // print help and return...
            processHelpCommand();
            return;
        }

        appLogger.LogDebug("checking to see if we have access to ffmpeg and ffprobe", {});
        const commandCheckResult = await ffmpegVideoConverter.checkCommands();
        if (!commandCheckResult.success) {
            appOutputWriter.writeLine("check for ffmpeg and ffprobe failed");
            appLogger.LogError("check for ffmpeg and ffprobe failed", new Error("ffmpeg or ffprobe are not installed?"), { commandCheckResult });
            return;
        }

        appLogger.LogDebug("ffmpeg and ffprobe found on system", { commandCheckResult });
        appOutputWriter.writeLine("ffmpeg and ffprobe found on system");

        let jobFileManager: IJobFileManager;
        if (fileManager.exists(jobFileFullPath)) {
            // we are reading from a job file, so no need to parse other args and create jobs,
            appLogger.LogInfo("reading job data from file", { targetJobFile: jobFileFullPath });
            appOutputWriter.writeLine(`reading job data from ${jobFileFullPath}`);
            const jobFileData = fileManager.readFile(jobFileFullPath);
            const initialJobsFileData: JobFile = JSON.parse(jobFileData);
            jobFileManager = new JobFileManager(appLogger, fileManager, jobFileFullPath, WRITE_PRETTY_JOB_FILE, initialJobsFileData);
        } else {
            // we need to make the jobs based on appOptions
            appLogger.LogInfo("writing new job file because job file value does not exist in fs", { jobFile: jobFileFullPath });
            appOutputWriter.writeLine(`writing job file to ${jobFileFullPath}`)
            let subCommand: SubCommand = INVALID;
            if (appOptions.convertVideo === true) {
                appLogger.LogDebug("convert flag found", {});
                subCommand = "convert";
            } else if (appOptions.getInfo === true) {
                appLogger.LogDebug("getInfo flag found", {});
                subCommand = "getinfo";
            } else if (appOptions.checkVideoIntegrity === true) {
                appLogger.LogDebug("checkVideoIntegrity flag found", {});
                subCommand = "checkvideointegrity";
            }
            appLogger.LogInfo("enumerating source path", { sourcePath: appOptions.sourcePath });
            appOutputWriter.writeLine(`enumerating directory: ${appOptions.sourcePath}`);
            const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath, 10);
            const jobs = getAllJobs(appLogger, subCommand, sourcePathContents, appOptions);
            const preRunSize = jobs.reduce((a, j) => j.fileInfo.size + a, 0);
            const jobFileName = basename(jobFileFullPath);
            const jobName = jobFileName.replace(extname(jobFileName), "");
            jobFileManager = new JobFileManager(appLogger, fileManager, jobFileFullPath, WRITE_PRETTY_JOB_FILE, {
                // The order of these fields is important.
                // The order here is the order they will appear in the file.
                // So ordering these well will make it easier to read in a text editor.
                jobID: getJobID(),
                jobName: jobName,
                percentDone: 0,
                percentSizeChange: 0,
                totalSizeChangeBytes: 0,
                prettyTotalSizeChange: bytesToHumanReadableBytes(0),
                durationMilliseconds: 0,
                prettyDuration: millisecondsToHHMMSS(0),
                totalSizeBeforeProcessing: preRunSize,
                prettyTotalSizeBeforeProcessing: bytesToHumanReadableBytes(preRunSize),
                totalSizeAfterProcessing: 0,
                prettyTotalSizeAfterProcessing: bytesToHumanReadableBytes(0),
                numCompletedJobs: 0,
                numFailedJobs: 0,
                failedJobIDs: [],
                numJobs: jobs.length,
                options: appOptions,
                jobs,
            });
            if (appOptions.saveJobFileOnly === true) {
                appLogger.LogInfo("exiting because saveJobFile flag is present.", { savedJobFileOnly: appOptions.saveJobFileOnly });
                appOutputWriter.writeLine(`saving job file (${jobs.length} jobs) jobs to ${jobFileFullPath}`);
                return;
            }
        }
        // handle Ctrl+C make sure to flush job file.
        process.on("SIGINT", async () => {
            await jobFileManager.shutdownAndFlush();
            throw new Error("SIGINT received, terminating application...")
        });
        appLogger.LogVerbose("processing jobs due to lack of saveJobFileOnly flag", { savedJobFileOnly: appOptions.saveJobFileOnly })
        const jobFileData = jobFileManager.readJobFileData();
        appLogger.LogVerbose("about to restore app options from job file", { oldAppOptions: appOptions });
        appOptions = jobFileData.options;
        appLogger.LogInfo("restoring app options from job file", { appOptions });
        appLogger.LogInfo("jobs loaded", { numJobs: jobFileData.jobs.length });
        appLogger.LogVerbose("listing all jobs data", { jobFileData });
        appOutputWriter.writeLine(`found ${jobFileData.jobs?.length} jobs based on parameters`);
        let totalSizeReduction = 0;
        const startTimeMilliseconds = Date.now();
        const numJobs = jobFileData.jobs.length
        let successfulJobs = 0;
        let failedJobs = 0; let i = 0;
        for (const jobOptions of jobFileData.jobs) {
            i++;
            appLogger.LogInfo("starting job", { commandID: jobOptions.commandID });
            appOutputWriter.writeLine("");
            appOutputWriter.writeLine(`starting job ${i} of ${numJobs} ${jobOptions.commandID} - ${jobOptions.task}`);
            if (jobOptions.state === "running" || jobOptions.state === "error") {
                // a job was started, so we need to clean up the what files may have been created
                appLogger.LogInfo(`job was interrupted or encountered an error attempting to restart job`, { job: jobOptions });
                appOutputWriter.writeLine(`job was interrupted or encountered an error attempting to restart job`);
                handleJobFailureCleanup(appLogger, appOutputWriter, jobOptions);
                jobOptions.state = "pending";
                jobFileManager.updateJob(jobOptions);
            } else if (jobOptions.state === "completed") {
                // skip the job its already done...
                appLogger.LogInfo("job is already completed... skipping...", { commandID: jobOptions.commandID, task: jobOptions.task, sourceFile: jobOptions.fileInfo.fullPath });
                appLogger.LogVerbose("previously completed job data", { job: jobOptions });
                appOutputWriter.writeLine(`previously completed job ${jobOptions.commandID}... see logs for details.`);
                continue;
            }
            // pending is the only other state?
            appOutputWriter.writeLine(`running job`)
            appLogger.LogDebug("job options", { job: jobOptions });
            let success = false
            let durationMilliseconds = 0;
            let sizeBytesReduction = 0;
            let sourceFile = "";
            let targetFile = "";
            try {
                jobOptions.state = "running";
                jobFileManager.updateJob(jobOptions);
                const job = JobFactory.MakeJob(appLogger, appOutputWriter, fileManager, jobOptions);
                const result = await job.execute();
                if (jobOptions.task === "convert") {
                    jobOptions.result = result as ConvertVideoResult;
                    durationMilliseconds = result.durationMilliseconds;
                    totalSizeReduction += jobOptions.result.sizeDifference;
                    sizeBytesReduction = jobOptions.result.sizeDifference;
                    sourceFile = jobOptions.result.sourceFileInfo.fullPath;
                    targetFile = jobOptions.result.targetFileInfo?.fullPath ?? "";
                    jobOptions.state = "completed";
                    success = result.success;
                } else if (jobOptions.task === "getinfo") {
                    jobOptions.result = result as GetVideoInfoResult;
                    durationMilliseconds = result.durationMilliseconds;
                    sourceFile = jobOptions.result.fileInfo.fullPath;
                    jobOptions.state = "completed";
                    success = result.success
                } else if (jobOptions.task === "copy") {
                    jobOptions.result = result as CopyResult;
                    durationMilliseconds = result.durationMilliseconds;
                    sourceFile = jobOptions.result.sourceFileInfo.fullPath;
                    targetFile = jobOptions.result.targetFileInfo?.fullPath ?? "";
                    jobOptions.state = "completed";
                    success = result.success;
                } else if (jobOptions.task === "checkvideointegrity") {
                    jobOptions.result = result as CheckVideoIntegrityResult;
                    durationMilliseconds = result.durationMilliseconds;
                    sourceFile = jobOptions.result.fileInfo.fullPath;
                    jobOptions.state = "completed";
                    success = result.success
                }
                else {
                    /// We should not be allowed to get here...
                    appLogger.LogWarn("job with invalid task encountered...", jobOptions);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (jobOptions as any).state = "error";
                }
                if (success !== true) {
                    jobOptions.state = "error";
                    failedJobs++;
                    appLogger.LogWarn("job failed", {
                        job: jobOptions
                    });
                    appOutputWriter.writeLine(`job failed: ${jobOptions.commandID}`);
                    appOutputWriter.writeLine(`reason: ${jobOptions.failureReason} - see logs for more details`);
                    appOutputWriter.writeLine(`run time: ${millisecondsToHHMMSS(durationMilliseconds)}`);
                } else {
                    successfulJobs++;
                    appLogger.LogInfo("job successful", { job: jobOptions });
                    appOutputWriter.writeLine(`job ${jobOptions.commandID} finished`);
                    appOutputWriter.writeLine(`run time: ${millisecondsToHHMMSS(durationMilliseconds)}`);
                    if (sizeBytesReduction !== 0) {
                        appOutputWriter.writeLine(`file size reduced by ${bytesToHumanReadableBytes(sizeBytesReduction)}`);
                    }
                    if (sourceFile !== "") {
                        appOutputWriter.writeLine(`source => ${sourceFile}`);
                        if (targetFile !== "") {
                            appOutputWriter.writeLine(`target => ${targetFile}`);
                        }
                    }
                }
            } catch (err) {
                failedJobs++;
                jobOptions.state = "error";
                jobOptions.failureReason = `${err}`;
                appLogger.LogError("job processing failed", err as Error, { job: jobOptions });
                appOutputWriter.writeLine(`an error occurred while processing job ${jobOptions.commandID}`);
                appOutputWriter.writeLine(`error: ${jobOptions.failureReason}`);
                handleJobFailureCleanup(appLogger, appOutputWriter, jobOptions);

            } finally {
                jobFileManager.updateJob(jobOptions);
            }
        }
        // add a line to make it easier to read.
        const endTimeMilliseconds = Date.now();
        const durationMilliseconds = endTimeMilliseconds - startTimeMilliseconds;
        const prettyDuration = millisecondsToHHMMSS(durationMilliseconds);
        const prettyTotalSizeReduction = bytesToHumanReadableBytes(totalSizeReduction);
        const totalJobs = jobFileData.jobs.length;
        appOutputWriter.writeLine("");
        appLogger.LogInfo("all jobs finished", { prettyDuration, durationMilliseconds, prettyTotalSizeReduction, totalSizeReduction, successfulJobs, failedJobs, totalJobs })
        appOutputWriter.writeLine(`All jobs finished`);
        appOutputWriter.writeLine(`Run time: ${prettyDuration}`);
        appOutputWriter.writeLine(`Total Size Reduction: ${prettyTotalSizeReduction}`);
        appOutputWriter.writeLine(`Jobs Successful: ${successfulJobs}`);
        appOutputWriter.writeLine(`Jobs Failed: ${failedJobs}`);
        appOutputWriter.writeLine(`Total number of jobs: ${totalJobs}`);
        await jobFileManager.shutdownAndFlush();

    } catch (err: unknown) {
        appLogger.LogError("app encountered fatal error!", err as Error, {});
        appOutputWriter.writeLine("app encountered fatal error, please see the logs");
    } finally {
        appLogger.LogInfo("The job file for this run was saved", { jobFile: jobFileFullPath });
        appOutputWriter.writeLine(`The job file for this run is located at: ${jobFileFullPath}`);
        await appOutputWriter.shutdown();
        await appLogger.shutdown();
    }

    function handleJobFailureCleanup(logger: ILogger, outputWriter: IOutputWriter, jobOptions: JobOptions) {
        delete jobOptions.failureReason;
        let targetFileFullPath: string;
        if (jobOptions.task === "convert") {
            targetFileFullPath = jobOptions.options.targetFileFullPath;
            delete jobOptions.result?.commandErrOutput;
            delete jobOptions.result?.commandStdOutput;
        } else if (jobOptions.task === "copy") {
            targetFileFullPath = jobOptions.targetFileFullPath;
        } else {
            delete jobOptions.result?.commandErrOutput;
            delete jobOptions.result?.commandStdOutput;
            logger.LogVerbose("job type does not require cleanup.", { job: jobOptions })
            return;
        }
        logger.LogDebug("attempting to clean up failed job data.", { job: jobOptions });
        outputWriter.writeLine(`attempting to delete target file if it exists ${targetFileFullPath}`);
        fileManager.safeUnlinkFile(targetFileFullPath);
        if (fileManager.exists(targetFileFullPath)) {
            logger.LogWarn("failed to clean up failed job data", { targetFileFullPath });
            outputWriter.writeLine(`failed to clean up failed job data ${targetFileFullPath}`);
        } else {
            logger.LogInfo("successfully removed failed job file data", { targetFileFullPath });
            outputWriter.writeLine(`successfully removed failed job file data`);
        }
    }

    function getTargetFileFullPath(logger: ILogger, sourceFile: FileInfo, options: AppOptions): {
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

    function doesFileMatchCriteria(logger: ILogger, item: FileInfo, task: Task, allowedFileExtensions: string[], fileNameRegex?: RegExp): boolean {
        if (fileNameRegex !== undefined) {
            if (fileNameRegex.test(item.name)) {
                logger.LogDebug("adding file for processing because it matched the regex", {
                    targetFileNameRegex: fileNameRegex.source,
                    file: item,
                    task,
                })
                return true;
            } else {
                logger.LogInfo("skipping file because regex did not match name", {
                    targetFileNameRegex: fileNameRegex,
                    file: item,
                    task
                });
                return false;
            }
        } else if (allowedFileExtensions.indexOf(item.extension) >= 0) {
            logger.LogDebug("file selected because extension matched allowed file extensions", {
                allowedFileExtensions,
                file: item,
                task,
            });
            return true
        }
        return false;
    }

    function makeJob(logger: ILogger, task: Task, fileInfo: FileInfo, appOptions: AppOptions): JobOptions {
        const commandID = getJobCommandID(task);
        logger.LogVerbose(`making job of type ${task}`, { fileInfo, appOptions, task });
        if (task === "convert") {
            const targetFileFullPath = getTargetFileFullPath(appLogger, fileInfo, appOptions).targetFileFullPath;
            const videoConvertOptions: VideoConvertOptions = {
                commandID,
                tryDeleteTargetFileIfIntegrityCheckFails: true, // TODO: make this configurable.
                useCuda: appOptions.useCuda,
                timeoutMilliseconds: CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS,
                targetAudioEncoding: appOptions.targetAudioEncoder,
                targetVideoEncoding: appOptions.targetVideoEncoder,
                targetContainerFormat: appOptions.targetContainerFormat,
                targetFileFullPath: targetFileFullPath,
                xArgs: appOptions.xArgs,
            };
            return {
                baseCommand: FFMPEG_COMMAND,
                getInfoCommand: FFPROBE_COMMAND,
                commandID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "convert",
                options: videoConvertOptions,
            } as ConvertJobOptions;
        } else if (task === "getinfo") {
            const getVideoInfoOptions: GetVideoInfoOptions = {
                commandID,
                timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
                xArgs: appOptions.xArgs,
            };
            return {
                baseCommand: FFPROBE_COMMAND,
                commandID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "getinfo",
                options: getVideoInfoOptions,
            } as GetInfoJobOptions;
        } else if (task === "copy") {
            const targetFileFullPath = getTargetFileFullPath(appLogger, fileInfo, appOptions).targetFileFullPath;
            return {
                commandID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "copy",
                targetFileFullPath,
            } as CopyJobOptions;
        } else if (task === "checkvideointegrity") {
            return {
                baseCommand: FFPROBE_COMMAND,
                commandID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "checkvideointegrity",
                options: {
                    commandID,
                    timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
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

    function getAllJobs(logger: ILogger, subCommand: SubCommand, items: FSItem[], options: AppOptions): JobsOptionsArray {
        logger.LogDebug("getting all files based on parameters", { targetFileNameRegex: options.targetFileNameRegex?.source, allowedFileExtensions: options.allowedFileExtensions })
        const allowCopy = !options.saveInPlace;
        const jobs: JobsOptionsArray = [];
        for (const item of items) {
            if (item.type === "file") {
                if (doesFileMatchCriteria(logger, item, subCommand, options.allowedFileExtensions, options.targetFileNameRegex)) {
                    jobs.push(makeJob(logger, subCommand, item, options));
                }
                else if (allowCopy && doesFileMatchCriteria(logger, item, "copy", options.fileCopyExtensions, options.fileCopyRegex)) {
                    // is file one we should copy?
                    logger.LogInfo("copy job created", {
                        fileInfo: item,
                    });
                    jobs.push(makeJob(logger, "copy", item, options));
                } else {
                    logger.LogDebug("file name does not match the selection criteria", { fileName: item.name });
                }
            } else if (item.type === 'directory') {
                const subItems: JobsOptionsArray = getAllJobs(logger, subCommand, item.files, options);
                jobs.push(...subItems);
            }
        }
        return jobs;
    }

    function processHelpCommand() {
        appLogger.LogInfo("help command invoked", {});
        PrintHelp();
        appLogger.LogInfo("help command finished", {});
    }

})().then(() => {
    // FIXME: make sure we are canceling any running jobs. handler interrupts like Ctrl+C?
    process.exit();
});
