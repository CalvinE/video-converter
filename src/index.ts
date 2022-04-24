import { join, resolve } from 'path';
import { getConvertVideoCommandID, VideoGetInfoResult } from './VideoConverter/models';
import { IOutputWriter } from './OutputWriter/models';
import { ConsoleOutputWriter } from './OutputWriter/ConsoleOutputWriter';
import { FileManager, FSItem, FileInfo } from './FileManager';
import { FileLogger, ILogger } from './Logger';
import { FFMPEGVideoConverter, getVideoInfoCommandID } from './VideoConverter';
import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';

const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
const CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS = 0;

(async function() {
    const start = new Date();
    const appOptions: AppOptions = ParseOptions();
    // const logger: ILogger = new PrettyJSONConsoleLogger("verbose");
    const appLogger: ILogger = new FileLogger("verbose", "./logs", true);
    const outputWriter: IOutputWriter = new ConsoleOutputWriter();
    await outputWriter.initialize()
    const fileManager = new FileManager(appLogger);
    const ffmpegVideoConverter = new FFMPEGVideoConverter("ffmpeg", "ffprobe", appLogger, fileManager);
    appLogger.LogDebug("checking to see if we have access to ffmpeg and ffprobe", {});
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

    await outputWriter.shutdown();
    await appLogger.shutdown();

    function getTargetFileFullPath(logger: ILogger, sourceFile: FileInfo, options: AppOptions): string {
        let targetFileFullPath: string;
        logger.LogVerbose("attempting to build taget file full path", {source: sourceFile, options});
        if (options.saveInPlace) {
            targetFileFullPath = sourceFile.fullPath;
            logger.LogDebug("save in place options set. using source file full path", {sourceFileFullPath: sourceFile.fullPath});
        } else {
            targetFileFullPath = resolve(options.savePath);
            logger.LogDebug("using options save path for target file path", {targetFileFullPath})
        }

        let targetFileName: string;
        if (options.targetContainerFormat === "copy") {
            targetFileName = sourceFile.name;
            logger.LogDebug("option target container format is set to copy, so we are not changing the extension", {});
        } else {
            targetFileName = `${sourceFile.name.substring(sourceFile.name.lastIndexOf("."))}.${options.targetContainerFormat}`;
            logger.LogDebug("using option taget container format on file name", {targetFileName, targetContainerFormat: options.targetContainerFormat});
        }

        const result = join(targetFileFullPath, targetFileName);
        logger.LogDebug("target file location built", {sourceFile, targetFileLocation: result});
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
                commmandID: getVideoInfoCommandID(),
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
        outputWriter.writeString("video convert command invoked");
        const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath, 10);
        const files = getAllFiles(appLogger, sourcePathContents, appOptions.targetFileNameRegex);
        const numFiles = files.length;
        appLogger.LogInfo("attempting to convert files", {
            numFiles,
        });
        outputWriter.writeString(`attempting to convert ${numFiles} files`);
        let i = 0;
        for (const f of files) {
            i++;
            appLogger.LogDebug(`attempting to convert file ${i} of ${numFiles}`, {});
            outputWriter.writeString(`attempting to convert file ${i} of ${numFiles}`);
            const targetFileFullPath = getTargetFileFullPath(appLogger, f, appOptions);
            const details = await ffmpegVideoConverter.convertVideo(f, {
                commmandID: getConvertVideoCommandID(),
                timeoutMilliseconds: CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS,
                sourceFileFullPath: f.fullPath,
                targetAudioEncoding: appOptions.targetAudioEncoder,
                targetVideoEncoding: appOptions.targetVideoEncoder,
                targetFileFullPath: targetFileFullPath,
            });
            totalRunTimeMilliseconds += details.duration;
            totalSizeDifference += details.sizeDifference;
            if (details.success) {
                appLogger.LogVerbose(`converted file ${i} of ${numFiles}`, details);
                outputWriter.writeString(`converted file ${i} of ${numFiles}`);
                outputWriter.writeString(`source: ${f.fullPath} => target: ${targetFileFullPath}`)
            } else {
                appLogger.LogWarn(`failed to convert file ${i} of ${numFiles}`, details);
                outputWriter.writeString(`failed to convert file ${i} of ${numFiles}`);
            }
        }
        appLogger.LogInfo("video convert command finished", {totalRunTimeMilliseconds, totalSizeDifference});
        outputWriter.writeString(`video convert command finished: total run time (ms) = ${totalRunTimeMilliseconds} - total size difference (bytes) = ${totalSizeDifference}`);
    }
})().then(() => {
    // FIXME: make sure we are canceling any running jobs. handler interrupts like Ctrl+C?
    process.exit();
});