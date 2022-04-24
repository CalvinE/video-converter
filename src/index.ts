import { randomUUID } from 'crypto';
import { FileManager, FSItem, FileInfo } from './FileManager';
import { FileLogger } from './Logger';
import { FFMPEGVideoConverter } from './VideoConverter';
import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';

const GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
// const CONVERT_VIDEO_COMMAND_TIMEOUT_MILLISECONDS = 0;

async function run() {
    function getAllFiles(items: FSItem[]): FileInfo[] {
        const files: FileInfo[] = [];
        for (const item of items) {
            if (item.type === 'file' ) {
                files.push(item);
            } else if (item.type === 'directory') {
                const subItems = getAllFiles(item.files);
                files.push(...subItems);
            }
        }
        return files;
    }
    const appOptions: AppOptions = ParseOptions();
    // const logger = new PrettyJSONConsoleLogger("verbose");
    const logger = new FileLogger("verbose", "./logs", true);
    const fileManager = new FileManager(logger);
    const ffmpegVideoConverter = new FFMPEGVideoConverter("ffmpeg", "ffprobe", logger, fileManager);
    const result = await ffmpegVideoConverter.checkCommand([]);
    if (!result) {
        logger.LogError("check for ffmpeg and ffprobe failed", new Error("ffmpeg or ffprobe are not installed?"), {}); 
        return;
    }
    if (appOptions.help === true) {
        // print help and return...
        PrintHelp();
        return;
    } else if (appOptions.getInfo === true) {
        const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath, 10);
        const files = getAllFiles(sourcePathContents);
        for (const f of files) {
                const details = await ffmpegVideoConverter.GetVideoInfo(f, {
                    commmandID: randomUUID(),
                    timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
                });
                logger.LogDebug('fileInfo', details);
        }
    } else if (appOptions.convertVideo === true) {
        // TODO:
    }
    await logger.shutdown();
}

run().then(() => {
    process.exit();
});