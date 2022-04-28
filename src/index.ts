import { IJobFileManager, JobFileManager } from './JobFileManager';
import { join, resolve } from 'path';
import { CommandStdErrMessageReceivedEventData, VideoConverterEventName_StdErrMessageReceived, VideoGetInfoResult, VideoStreamInfo, VideoConvertOptions, VideoConvertResult, GetVideoInfoOptions, Task, getJobCommandID, SubCommand, ConvertJob, GetInfoJob, CopyJob, INVALID, JobsArray, getJobID } from './VideoConverter/models';
import { IOutputWriter } from './OutputWriter/models';
import { ConsoleOutputWriter } from './OutputWriter/ConsoleOutputWriter';
import { FileManager, FSItem, FileInfo } from './FileManager';
import { FileLogger, ILogger } from './Logger';
import { FFMPEGVideoConverter } from './VideoConverter';
import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';
import { bytesToHumanReadableBytes, millisecondsToHHMMSS } from './PrettyPrint';

const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
const CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS = 0;
const FFMPEG_CURRENT_FRAME_REGEX = /frame=\s*(?<framenumber>\d+)/;

const PROGRESSIVE_UPDATE_CHAR_WIDTH = 40;

/* 
    TODO: list
    * make a function to create output folders, so the parent directory is all in one place...
    * Improve code here so there is not so much in one place to try and read...
    * handle signals to cancel the command properly like ???
    * Have a file name alteration function replace certain string with others, etc...
    * write *better* help info...
    * add log file directory as parameter
    * fix potential issue in options parser where there may be only one arg before options...
*/

(async function () {
    let appOptions: AppOptions = ParseOptions();
    // const logger: ILogger = new PrettyJSONConsoleLogger("verbose");
    const appLogger: ILogger = new FileLogger("verbose", join(".", "output", "logs"), true);
    appLogger.LogDebug("application starting", { appOptions })
    const appOutputWriter: IOutputWriter = new ConsoleOutputWriter();
    await appOutputWriter.initialize()
    const fileManager = new FileManager(appLogger);

    const ffmpegVideoConverter = new FFMPEGVideoConverter("ffmpeg", "ffprobe", appLogger, fileManager);
    try {
        if (appOptions.help === true) {
            // print help and return...
            processHelpCommand();
            return;
        }

        appLogger.LogDebug("checking to see if we have access to ffmpeg and ffprobe", {});
        const commandCheckResult = await ffmpegVideoConverter.checkCommands();
        process.on("SIGINT", () => {
            throw new Error("SIGINT received, terminating application...")
        });
        if (!commandCheckResult.success) {
            appOutputWriter.writeLine("check for ffmpeg and ffprobe failed");
            appLogger.LogError("check for ffmpeg and ffprobe failed", new Error("ffmpeg or ffprobe are not installed?"), { commandCheckResult });
            return;
        }

        appLogger.LogDebug("ffmpeg and ffprobe found on system", { commandCheckResult });
        appOutputWriter.writeLine("ffmpeg and ffprobe found on system");

        let jobFileManager: IJobFileManager;
        if (fileManager.exists(appOptions.jobFile)) {
            // we are reading from a job file, so no need to parse other args and create jobs,
            appLogger.LogInfo("reading job data from file", { targetJobFile: appOptions.jobFile });
            appOutputWriter.write(`reading job data from ${appOptions.jobFile}`);
            // const jobFileData = fileManager.readFile(appOptions.jobFile);
            // jobs = JSON.parse(jobFileData);
            jobFileManager = new JobFileManager(appLogger, fileManager, appOptions.jobFile);
        } else {
            // we need to make the jobs based on appOptions
            appLogger.LogInfo("writing new job file because job file value does not exist in fs", { jobFile: appOptions.jobFile })
            let subCommand: SubCommand = INVALID;
            if (appOptions.convertVideo === true) {
                appLogger.LogDebug("convert flag found", {});
                subCommand = "convert";
            } else if (appOptions.getInfo === true) {
                appLogger.LogDebug("getinfo flag found", {});
                subCommand = "getinfo";
            }
            appLogger.LogInfo("enumerating source path", { sourcePath: appOptions.sourcePath });
            appOutputWriter.writeLine(`enumerating directory: ${appOptions.sourcePath}`);
            const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath, 10);
            const jobs = getAllJobs(appLogger, subCommand, sourcePathContents, appOptions);
            jobFileManager = new JobFileManager(appLogger, fileManager, appOptions.jobFile, {
                jobID: getJobID(),
                durationMilliseconds: 0,
                numCompletedJobs: 0,
                numFailedJobs: 0,
                numJobs: jobs.length,
                jobs,
                options: appOptions,
                prettyDuration: millisecondsToHHMMSS(0),
                prettyTotalReduction: bytesToHumanReadableBytes(0),
                totalSizeReductionBytes: 0,
            });
            if (appOptions.saveJobFileOnly === true) {
                appLogger.LogInfo("exiting because saveJobFile flag is present.", { savedJobFileOnly: appOptions.saveJobFileOnly });
                appOutputWriter.write(`saving job file (${jobs.length} jobs) jobs to ${appOptions.jobFile}`);
                return;
            }
        }
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
        let successfulJobs = 0;
        let failedJobs = 0;
        for (const job of jobFileData.jobs) {
            if (job.state === "running" || job.state === "error") {
                // a job was started, so we need to clean up the what files may have been created
                appLogger.LogInfo(`attempting to restart job`, { job });
                appOutputWriter.writeLine(`attempting to restart job: ${job.state} - ${job.task} - ${job.commandID}`);
                if (job.task === "convert") {
                    appOutputWriter.writeLine(`attempting to remove partially processed file: ${job.options.targetFileFullPath}`);
                    fileManager.safeUnlinkFile(job.options.targetFileFullPath);
                } else if (job.task === "copy") {
                    appOutputWriter.writeLine(`attempting to remove partially processed file: ${job.targetFileFullPath}`);
                    fileManager.safeUnlinkFile(job.targetFileFullPath);
                }
                job.state = "pending";
            } else if (job.state === "completed") {
                // skip the job its already done...
                appLogger.LogInfo("job is already completed... skipping...", { commandID: job.commandID, task: job.task, sourceFile: job.fileInfo.fullPath });
                appLogger.LogVerbose("previously completed job data", { job });
                appOutputWriter.writeLine(`previous completed job ${job.commandID}... see logs for details.`);
                continue;
            }
            // pending is the only other state?
            appLogger.LogInfo("starting job", { commandID: job.commandID });
            appOutputWriter.writeLine(`starting job ${job.commandID} - ${job.task}`)
            appLogger.LogDebug("job options", { job });
            let success = false
            let durationMilliseconds = 0;
            let sizeBytesReduction = 0;
            let sourceFile = "";
            let targetFile = "";
            try {
                if (job.task === "convert") {
                    job.state = "running";
                    const result = await processVideoConvertCommand(appLogger, appOutputWriter, job);
                    durationMilliseconds = result.duration;
                    totalSizeReduction += result.sizeDifference;
                    sizeBytesReduction = result.sizeDifference;
                    sourceFile = result.sourceFileFullPath;
                    targetFile = result.targetFileFullPath;
                    job.state = "completed";
                    job.result = result;
                    success = result.success;
                } else if (job.task === "getinfo") {
                    job.state = "running";
                    const result = await processGetInfo(appLogger, appOutputWriter, job);
                    durationMilliseconds = result.duration;
                    sourceFile = result.sourceFileFullPath;
                    job.state = "completed";
                    job.result = result;
                    success = result.success
                } else if (job.task === "copy") {
                    job.state = "running";
                    sourceFile = job.fileInfo.fullPath;
                    const targetFile = job.targetFileFullPath;
                    appOutputWriter.writeLine(`copying file: ${sourceFile} => ${targetFile}`);
                    const now = Date.now();
                    success = fileManager.copyFile(sourceFile, targetFile);
                    const then = Date.now();
                    durationMilliseconds = then - now;
                    job.state = "completed";
                    job.result = success;
                } else {
                    /// We should not be allowed to get here...
                    appLogger.LogWarn("job with invalid task encountered...", job);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (job as any).state = "error";
                }
                if (success !== true) {
                    failedJobs++;
                    appLogger.LogWarn("job failed", {
                        job
                    });
                    appOutputWriter.writeLine(`job ${job.commandID} failed see logs for details`);
                    appOutputWriter.writeLine(`run time: ${millisecondsToHHMMSS(durationMilliseconds)}`);
                } else {
                    successfulJobs++;
                    appLogger.LogInfo("job successful", { job });
                    appOutputWriter.writeLine(`job ${job.commandID} completed`);
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
                // add a line to make it easier to read.
                appOutputWriter.writeLine("");
            } catch (err) {
                failedJobs++;
                job.state = "error";
                job.failureReason = `${err}`;
                appOutputWriter.writeLine(`an error occurred while processing job ${job.commandID}`);
                appOutputWriter.writeLine(`error: ${job.failureReason}`);
            }
        }
        // add a line to make it easier to read.
        appOutputWriter.writeLine("");
        const endTimeMilliseconds = Date.now();
        const durationMilliseconds = endTimeMilliseconds - startTimeMilliseconds;
        const prettyDuration = millisecondsToHHMMSS(durationMilliseconds);
        const prettyTotalSizeReduction = bytesToHumanReadableBytes(totalSizeReduction);
        const totalJobs = jobFileData.jobs.length;
        await jobFileManager.shutdownAndFlush();
        appLogger.LogInfo("all jobs finished", { prettyDuration, durationMilliseconds, prettyTotalSizeReduction, totalSizeReduction, successfulJobs, failedJobs, totalJobs })
        appOutputWriter.writeLine(`All jobs completed`);
        appOutputWriter.writeLine(`Run time: ${prettyDuration}`);
        appOutputWriter.writeLine(`Total Size Reduction: ${prettyTotalSizeReduction}`);
        appOutputWriter.writeLine(`Jobs Successful: ${successfulJobs}`);
        appOutputWriter.writeLine(`Jobs Failed: ${failedJobs}`);
        appOutputWriter.writeLine(`Total number of jobs: ${totalJobs}`);

    } catch (err: unknown) {
        appLogger.LogError("app encountered fatal error!", err as Error, {});
        appOutputWriter.writeLine("app encountered fatal error, please see the logs");
    } finally {
        await appOutputWriter.shutdown();
        await appLogger.shutdown();
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

        let targetFileFullPath: string;
        if (options.targetContainerFormat === "copy") {
            targetFileFullPath = sourceFile.name;
            logger.LogDebug("option target container format is set to copy, so we are not changing the extension", {});
        } else {
            targetFileFullPath = `${sourceFile.name.substring(sourceFile.name.lastIndexOf("."))}.${options.targetContainerFormat}`;
            logger.LogDebug("using option target container format on file name", { targetFileName: targetFileFullPath, targetContainerFormat: options.targetContainerFormat });
        }

        targetFileFullPath = join(absoluteParentPath, targetFileFullPath);
        logger.LogDebug("target file location built", { sourceFile, absoluteParentPath, targetFileFullPath, });
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

    function makeJob(logger: ILogger, task: Task, fileInfo: FileInfo, appOptions: AppOptions): (ConvertJob | GetInfoJob | CopyJob) {
        const commandID = getJobCommandID(task);
        logger.LogVerbose(`making job of type ${task}`, { fileInfo, appOptions, task });
        if (task === "convert") {
            const targetFileFullPath = getTargetFileFullPath(appLogger, fileInfo, appOptions).targetFileFullPath;
            const videoConvertOptions: VideoConvertOptions = {
                commandID,
                useCuda: appOptions.useCuda,
                timeoutMilliseconds: CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS,
                targetAudioEncoding: appOptions.targetAudioEncoder,
                targetVideoEncoding: appOptions.targetVideoEncoder,
                targetFileFullPath: targetFileFullPath,
                xArgs: appOptions.xArgs,
            };
            return {
                commandID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "convert",
                options: videoConvertOptions,
            };
        } else if (task === "getinfo") {
            const getVideoInfoOptions: GetVideoInfoOptions = {
                commandID,
                timeoutMilliseconds: CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS,
                xArgs: appOptions.xArgs,
            };
            return {
                commandID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "getinfo",
                options: getVideoInfoOptions,
            };
        } else if (task === "copy") {
            const targetFileFullPath = getTargetFileFullPath(appLogger, fileInfo, appOptions).targetFileFullPath;
            return {
                commandID,
                fileInfo,
                host: "local",
                state: "pending",
                task: "copy",
                targetFileFullPath,
            }
        }
        const error = new Error(`invalid task type encountered: ${task}`)
        logger.LogError("invalid task type provided", error, {
            task,
            fileInfo,
            options: appOptions,
        });
        throw error;
    }

    function getAllJobs(logger: ILogger, subCommand: SubCommand, items: FSItem[], options: AppOptions,): JobsArray {
        logger.LogDebug("getting all files based on parameters", { targetFileNameRegex: options.targetFileNameRegex?.source, allowedFileExtensions: options.allowedFileExtensions })
        const allowCopy = !options.saveInPlace;
        const jobs: JobsArray = [];
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
                const subItems: JobsArray = getAllJobs(logger, subCommand, item.files, options);
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

    async function processGetInfo(_logger: ILogger, _outputWriter: IOutputWriter, job: GetInfoJob): Promise<VideoGetInfoResult> {
        _outputWriter.writeLine(`getting file info: ${job.fileInfo.fullPath}`);
        const details = await ffmpegVideoConverter.getVideoInfo(job.fileInfo, {
            commandID: job.commandID,
            timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
            xArgs: appOptions.xArgs,
        });
        return details;
    }

    function parseNumberOfFrames(videoInfo?: VideoGetInfoResult): number {
        const videoStream: VideoStreamInfo | undefined = (videoInfo?.videoInfo?.streams?.find(s => s?.codec_type === "video") as VideoStreamInfo);
        const numberOfFrames = videoStream?.nb_frames;
        const numberOfFramesNumber = parseInt(numberOfFrames ?? "-1", 10);
        return numberOfFramesNumber;
    }

    function buildConvertOutputHandler(logger: ILogger, outputWriter: IOutputWriter, commandID: string, numberOfFrames: number): (args: CommandStdErrMessageReceivedEventData) => void {
        const hasNumberOfFrames = (numberOfFrames ?? -1) >= 1;
        const outputWriterSupportsProgressiveUpdates = hasNumberOfFrames && outputWriter.supportsProgressiveUpdates();
        if (!hasNumberOfFrames) {
            logger.LogDebug("could not determine number of frames in video. progressive updates cancelled.", { commandID, numberOfFrames });
        } else {
            logger.LogDebug("parsed out number of frames. progressive updated will be provided.", { commandID, numberOfFrames });
        }
        let messageCount = 0;
        return (args: CommandStdErrMessageReceivedEventData) => {
            if (args.commandId == commandID) {
                if (hasNumberOfFrames && outputWriterSupportsProgressiveUpdates) {
                    logger.LogVerbose("constructing progressive update line", { commandID, message: args.commandMessage })
                    // This is our current command we should do something with it?
                    const regexMatch = args.commandMessage.match(FFMPEG_CURRENT_FRAME_REGEX);
                    const currentFrame = regexMatch?.groups?.framenumber;
                    logger.LogVerbose("current frame found", { commandID, currentFrame, numberOfFrames })
                    if (currentFrame) {
                        const currentFrameNumber = parseInt(currentFrame, 10);
                        const pctDone = Math.floor(currentFrameNumber / numberOfFrames * 100);
                        const numMarkers = Math.floor(pctDone / 5);
                        logger.LogVerbose("percent done calculated", { commandID, numberOfFrames, currentFrame, currentFrameNumber, pctDone, numMarkers });
                        const arrow = `${"=".repeat(numMarkers ?? 0)}>`.padEnd(20, " ")
                        const progressiveUpdate = `|${arrow}| %${pctDone}`.padEnd(PROGRESSIVE_UPDATE_CHAR_WIDTH, " ");
                        outputWriter.write(`${progressiveUpdate}\r`);
                    }
                } else {
                    // lets show that something is happening...
                    if (messageCount % 10 === 0) {
                        outputWriter.write(".");
                    }
                    messageCount++;
                }
            }
        }
    }

    async function processVideoConvertCommand(logger: ILogger, outputWriter: IOutputWriter, job: ConvertJob): Promise<VideoConvertResult> {
        logger.LogDebug("getting video file info so that we can calculate progressive updates", { commandID: job.commandID, })
        const videoInfoResult = await ffmpegVideoConverter.getVideoInfo(job.fileInfo, {
            commandID: job.commandID,
            timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
            xArgs: [],
        })
        if (videoInfoResult.success !== false) {
            logger.LogWarn("failed to get video info", { videoInfoResult })
        }
        appOutputWriter.writeLine(`converting file: ${job.fileInfo.fullPath}`);
        const convertPromise = ffmpegVideoConverter.convertVideo(job.fileInfo, job.options);
        const numberOfFrames = parseNumberOfFrames(videoInfoResult ?? {});
        const outputHandler = buildConvertOutputHandler(logger, outputWriter, job.commandID, numberOfFrames);
        ffmpegVideoConverter.on(VideoConverterEventName_StdErrMessageReceived, outputHandler);
        const convertResult = await convertPromise
        ffmpegVideoConverter.off(VideoConverterEventName_StdErrMessageReceived, outputHandler);
        // write an empty line to advance the progressive update line
        appOutputWriter.writeLine("");
        return convertResult;
    }
})().then(() => {
    // FIXME: make sure we are canceling any running jobs. handler interrupts like Ctrl+C?
    process.exit();
});
