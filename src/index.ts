import { FileManager } from './FileManager';
import { FileLogger, PrettyJSONConsoleLogger } from './Logger';
import { FFMPEGVideoConverter } from './VideoConverter';
import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';


async function run() {
    const appOptions: Partial<AppOptions> = ParseOptions();
    if (appOptions.help === true) {
        // print help and return...
        PrintHelp();
        return;
    }
    // run the app?
    const logger = new FileLogger("verbose", "./logs", true);
    // const logger = new PrettyJSONConsoleLogger("verbose");
    logger.LogDebug("This is a test", {})
    const fileManager = new FileManager(logger);
    const ffmpegVideoConverter = new FFMPEGVideoConverter("ffmpeg", "ffprobe", logger, fileManager);
    const result = await ffmpegVideoConverter.checkCommand([]);
    const sourcePathContents = await fileManager.enumerateDirectory(appOptions.sourcePath!, 10);
    for (const item of sourcePathContents) {
        if (item.type === 'file') {
            const details = await ffmpegVideoConverter.GetVideoInfo(item);
            logger.LogDebug('temp', {});
        }
    }
    await logger.shutdown();
}

run().then(() => {
    process.exit();
});