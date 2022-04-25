import { join, resolve } from 'path';
import { CommandStdErrMessageReceivedEventData, getConvertVideoCommandID, VideoConverterEventName_StdErrMessageReceived, VideoGetInfoResult, VideoStreamInfo, VideoConvertOptions } from './VideoConverter/models';
import { IOutputWriter } from './OutputWriter/models';
import { ConsoleOutputWriter } from './OutputWriter/ConsoleOutputWriter';
import { FileManager, FSItem, FileInfo } from './FileManager';
import { FileLogger, ILogger } from './Logger';
import { FFMPEGVideoConverter, getVideoInfoCommandID } from './VideoConverter';
import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';

const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
const CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS = 0;
const FFMPEG_CURRENT_FRAME_REGEX = /frame=\s*(?<framenumber>\d+)/;

const PROGRESSIVE_UPDATE_CHAR_WIDTH = 40;

/* 
    TODO: list
    * Improve code here so there is not so much in one place to try and read...
    * add file filter mode to get all video file formats?
    * produce a stats object we can write to another file?
    * Have a job state file so jobs can be resumed if cancelled.
    * handle signals to cancel the command properly like Ctrl+C
*/

(async function () {
    const appOptions: AppOptions = ParseOptions();
    // const logger: ILogger = new PrettyJSONConsoleLogger("verbose");
    const appLogger: ILogger = new FileLogger("verbose", "./logs", true);
    const outputWriter: IOutputWriter = new ConsoleOutputWriter();
    await outputWriter.initialize()
    const fileManager = new FileManager(appLogger);
    const ffmpegVideoConverter = new FFMPEGVideoConverter("ffmpeg", "ffprobe", appLogger, fileManager);
    appLogger.LogDebug("checking to see if we have access to ffmpeg and ffprobe", {});
    try {
        const result = await ffmpegVideoConverter.checkCommand([]);
        if (!result) {
            appLogger.LogError("check for ffmpeg and ffprobe failed", new Error("ffmpeg or ffprobe are not installed?"), {});
            return;
        }
        if (appOptions.help === true) {
            // print help and return...
            processHelpCommand();
        } else if (appOptions.getInfo === true) {
            await processGetInfo();
        } else if (appOptions.convertVideo === true) {
            await processVideoConvertCommand();
        }

    } catch (err: unknown) {
        appLogger.LogError("app encountered fatal error!", err as Error, {});
        outputWriter.writeLine("app encountered fatal error, please see the logs");
    } finally {
        await outputWriter.shutdown();
        await appLogger.shutdown();
    }

    function getTargetFileFullPath(logger: ILogger, sourceFile: FileInfo, options: AppOptions): string {
        let targetFileFullPath: string;
        logger.LogVerbose("attempting to build taget file full path", { source: sourceFile, options });
        if (options.saveInPlace) {
            targetFileFullPath = sourceFile.fullPath;
            logger.LogDebug("save in place options set. using source file full path", { sourceFileFullPath: sourceFile.fullPath });
        } else if (options.copyRelativeFolderPath) {
            const fullRelativePath = join(options.savePath, sourceFile.relativepath);
            targetFileFullPath = resolve(fullRelativePath);
            logger.LogDebug("using options save path and source file relative path for target file path", { targetFileFullPath });
        } else {
            targetFileFullPath = resolve(options.savePath);
            logger.LogDebug("using options save path for target file path", { targetFileFullPath });
        }


        let targetFileName: string;
        if (options.targetContainerFormat === "copy") {
            targetFileName = sourceFile.name;
            logger.LogDebug("option target container format is set to copy, so we are not changing the extension", {});
        } else {
            targetFileName = `${sourceFile.name.substring(sourceFile.name.lastIndexOf("."))}.${options.targetContainerFormat}`;
            logger.LogDebug("using option taget container format on file name", { targetFileName, targetContainerFormat: options.targetContainerFormat });
        }

        const result = join(targetFileFullPath, targetFileName);
        logger.LogDebug("target file location built", { sourceFile, targetFileLocation: result });
        return result;
    }

    function getAllFiles(logger: ILogger, items: FSItem[], targetFileNameRegex?: RegExp,): FileInfo[] {
        const files: FileInfo[] = [];
        for (const item of items) {
            if (item.type === 'file') {
                if (targetFileNameRegex !== undefined) {
                    if (targetFileNameRegex.test(item.name)) {
                        logger.LogDebug("adding file for processing because it matched the regex", {
                            targetFileNameRegex: targetFileNameRegex.source,
                            file: item,
                        })
                        files.push(item);
                    } else {
                        logger.LogInfo("skipping file because regex did not match name", {
                            targetFileNameRegex: targetFileNameRegex.source,
                            file: item,
                        });
                    }
                } else { // TODO: implement other file matching? like file extension? all video formats?
                    files.push(item);
                }
            } else if (item.type === 'directory') {
                const subItems = getAllFiles(logger, item.files, targetFileNameRegex);
                files.push(...subItems);
            }
        }
        return files;
    }

    function processHelpCommand() {
        appLogger.LogInfo("help command invoked", {});
        PrintHelp();
        appLogger.LogInfo("help command finished", {});
    }

    async function processGetInfo() {
        appLogger.LogInfo("get info command invoked", {});
        const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath, 10);
        const files = getAllFiles(appLogger, sourcePathContents, appOptions.targetFileNameRegex);
        const numFiles = files.length;
        appLogger.LogInfo("attempting to info for files", {
            numFiles,
        });
        const fileDetails: VideoGetInfoResult[] = [];
        let i = 0;
        for (const f of files) {
            appLogger.LogDebug(`attempting to get info for file ${i++} of ${numFiles}`, {});
            const details = await ffmpegVideoConverter.getVideoInfo(f, {
                commandID: getVideoInfoCommandID(),
                timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
            });
            if (details.success) {
                appLogger.LogVerbose(`got info for file ${i++} of ${numFiles}`, details);
            } else {
                appLogger.LogWarn(`failed to get info for file ${i++} of ${numFiles}`, details);
            }
            fileDetails.push(details);
        }
        outputWriter.writeObject(fileDetails);
        appLogger.LogInfo("get info command finished", {});
    }

    async function processVideoConvertCommand() {
        let totalRunTimeMilliseconds = 0;
        let totalSizeDifference = 0;
        appLogger.LogInfo("video convert command invoked", {});
        outputWriter.writeLine("video convert command invoked");
        const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath, 10);
        const files = getAllFiles(appLogger, sourcePathContents, appOptions.targetFileNameRegex);
        const numFiles = files.length;
        appLogger.LogInfo("attempting to convert files", {
            numFiles,
        });
        outputWriter.writeLine(`attempting to convert ${numFiles} files`);
        let i = 0;
        for (const f of files) {
            i++;
            const commandID = getConvertVideoCommandID();
            appLogger.LogDebug(`attempting to convert file ${i} of ${numFiles}`, { commandID });
            outputWriter.writeLine(`attempting to convert file ${i} of ${numFiles}`);
            const targetFileFullPath = getTargetFileFullPath(appLogger, f, appOptions);
            appLogger.LogDebug("attempting to get video file info so that we can calculate progressive updates", { commandID, })
            const videoInfo = await ffmpegVideoConverter.getVideoInfo(f, {
                commandID,
                timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
            })
            const videoConvertOptions: VideoConvertOptions = {
                commandID,
                timeoutMilliseconds: CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS,
                sourceFileFullPath: f.fullPath,
                targetAudioEncoding: appOptions.targetAudioEncoder,
                targetVideoEncoding: appOptions.targetVideoEncoder,
                targetFileFullPath: targetFileFullPath,
            }
            appLogger.LogInfo("attempting to convert video", { file: f, commandID, videoConveryOptions: videoConvertOptions })
            outputWriter.writeLine(`file: ${videoConvertOptions.sourceFileFullPath}`);
            const convertPromise = ffmpegVideoConverter.convertVideo(f, videoConvertOptions);
            const outputWriterSupportsProgressiveUpdates = outputWriter.supportsProgressiveUpdates() && videoInfo.success === true;
            const outputHandler = (() => {
                const videoStream: VideoStreamInfo | undefined = (videoInfo.videoInfo.streams.find(s => s.codec_type === "video") as VideoStreamInfo);
                const numberOfFrames = videoStream?.nb_frames;
                const numberOfFramesNumber = parseInt(numberOfFrames ?? "-1", 10);
                appLogger.LogDebug("parsed out number of frames", { commandID, numberOfFrames, numberOfFramesNumber });
                return (args: CommandStdErrMessageReceivedEventData) => {
                    if (args.commandId == commandID && numberOfFramesNumber !== -1) {
                        appLogger.LogDebug("constructing progressive update line", { commandID, message: args.message })
                        // This is our current command we should do somthing with it?
                        // TODO: implment write progressive line on output writer....
                        const regexMatch = args.message.match(FFMPEG_CURRENT_FRAME_REGEX);
                        const currentFrame = regexMatch?.groups?.framenumber;
                        appLogger.LogDebug("current frame found", { commandID, currentFrame, numberOfFramesNumber })
                        if (currentFrame) {
                            const currentFrameNumber = parseInt(currentFrame, 10);
                            const pctDone = Math.floor(currentFrameNumber / numberOfFramesNumber * 100);
                            const numMarkers = Math.floor(pctDone / 5);
                            appLogger.LogVerbose("found current frame", { commandID, numberOfFramesNumber, currentFrame, currentFrameNumber, pctDone, numMarkers });
                            const arrow = `${"=".repeat(numMarkers ?? 0)}>`.padEnd(20, " ")
                            const progressiveUpdate = `|${arrow}| %${pctDone}`.padEnd(PROGRESSIVE_UPDATE_CHAR_WIDTH, " ");
                            outputWriter.write(`${progressiveUpdate}\r`);
                        }
                    }
                }
            })();
            if (outputWriterSupportsProgressiveUpdates) {
                ffmpegVideoConverter.on(VideoConverterEventName_StdErrMessageReceived, outputHandler)
            }
            const convertResult = await convertPromise
            if (outputWriterSupportsProgressiveUpdates) {
                ffmpegVideoConverter.off(VideoConverterEventName_StdErrMessageReceived, outputHandler)
                // write an empty line to advance the progressive update line
                outputWriter.writeLine("");
            }
            totalRunTimeMilliseconds += convertResult.duration;
            totalSizeDifference += convertResult.sizeDifference;
            if (convertResult.success) {
                appLogger.LogVerbose(`converted file ${i} of ${numFiles}`, convertResult);
                outputWriter.writeLine(`converted file ${i} of ${numFiles}`);
                outputWriter.writeLine(`source: ${f.fullPath} => target: ${targetFileFullPath}`)
            } else {
                appLogger.LogWarn(`failed to convert file ${i} of ${numFiles}`, convertResult);
                outputWriter.writeLine(`failed to convert file ${i} of ${numFiles}`);
            }
        }
        appLogger.LogInfo("video convert command finished", { totalRunTimeMilliseconds, totalSizeDifference });
        outputWriter.writeLine(`video convert command finished: total run time (ms) = ${totalRunTimeMilliseconds} - total size difference (bytes) = ${totalSizeDifference}`);
    }
})().then(() => {
    // FIXME: make sure we are canceling any running jobs. handler interrupts like Ctrl+C?
    process.exit();
});