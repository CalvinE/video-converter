import { VideoGetInfoResult } from './VideoConverter/models';
import { IOutputWriter } from './OutputWriter/models';
import { ConsoleOutputWriter } from './OutputWriter/ConsoleOutputWriter';
import { FileManager, FSItem, FileInfo } from './FileManager';
import { FileLogger, ILogger } from './Logger';
import { FFMPEGVideoConverter, getVideoInfoCommandID } from './VideoConverter';
import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';

const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
// const CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS = 0;

async function run() {
    const appOptions: AppOptions = ParseOptions();
    // const logger: ILogger = new PrettyJSONConsoleLogger("verbose");
    const logger: ILogger = new FileLogger("verbose", "./logs", true);
    const outputWriter: IOutputWriter = new ConsoleOutputWriter();
    await outputWriter.initialize()
    const fileManager = new FileManager(logger);
    const ffmpegVideoConverter = new FFMPEGVideoConverter("ffmpeg", "ffprobe", logger, fileManager);
    logger.LogDebug("checking to see if we have access to ffmpeg and ffprobe", {});
    const result = await ffmpegVideoConverter.checkCommand([]);
    if (!result) {
        logger.LogError("check for ffmpeg and ffprobe failed", new Error("ffmpeg or ffprobe are not installed?"), {});
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
    await logger.shutdown();

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
        logger.LogInfo("help command invoked", {});
        PrintHelp();
        logger.LogInfo("help command finished", {});
    }

    async function processGetInfo() {
        logger.LogInfo("get info command invoked", {});
        const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath, 10);
        const files = getAllFiles(logger, sourcePathContents, appOptions.targetFileNameRegex);
        const numFiles = files.length;
        logger.LogInfo("getting info for files", {
            numFiles,
        });
        const fileDetails: VideoGetInfoResult[] = [];
        let i = 0;
        for (const f of files) {
            logger.LogDebug(`attempting to get info for file ${i++} of ${numFiles}`, {});
            const details = await ffmpegVideoConverter.getVideoInfo(f, {
                commmandID: getVideoInfoCommandID(),
                timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
            });
            if (details.success) {
                logger.LogVerbose(`got info for file ${i++} of ${numFiles}`, details);
            } else {
                logger.LogWarn(`failed to get info for file ${i++} of ${numFiles}`, details);
            }
            fileDetails.push(details);
        }
        outputWriter.writeObject(fileDetails);
        logger.LogInfo("get info command finished", {});
    }

    async function processVideoConvertCommand() {
        // TODO: write implementation for video conversion!
        logger.LogInfo("video convert command invoked", {});

        logger.LogInfo("video convert command finished", {});
    }
}

run().then(() => {
    process.exit();
});