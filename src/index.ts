import { FileLogger } from './Logger/FileLogger';
import { FFMPEGVideoConverter } from './VideoConverter';
import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';


(async function() {
    const appOptions: Partial<AppOptions> = ParseOptions();
    if (appOptions.help === true) {
        // print help and return...
        PrintHelp();
        return;
    }
    // run the app?
    const logger = new FileLogger("verbose", "./logs", true);
    logger.LogDebug("This is a test", {})
    const runner = new FFMPEGVideoConverter("ffmpeg", logger);
    const result = await runner.checkCommand([]);    
    logger.LogDebug("finshed!", {result});
    await logger.shutdown();
})()