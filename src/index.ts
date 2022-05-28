import { StandAloneRunner } from './Runners/StandAloneRunner';
import { IRunner } from './Runners/IRunner';
import {
    join
} from 'path';
import {
    IOutputWriter
} from './OutputWriter/models';
import {
    ConsoleOutputWriter
} from './OutputWriter/ConsoleOutputWriter';
import {
    FileManager,
} from './FileManager/FileManager';
import {
    FileLogger,
    ILogger
} from './Logger';
import {
    FFMPEGVideoConverter
} from './VideoConverter';
import {
    AppOptions,
    ParseCLIOptions,
    PrintHelp
} from './OptionsParser';

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
    const appOptions: AppOptions = ParseCLIOptions();
    // const logger: ILogger = new PrettyJSONConsoleLogger("verbose");
    const appLogger: ILogger = new FileLogger("info", join(appOptions.metadataPath, "logs"), true);
    appLogger.LogDebug("application starting", { appOptions });
    const appOutputWriter: IOutputWriter = new ConsoleOutputWriter();
    await appOutputWriter.initialize();
    const fileManager = new FileManager(appLogger);

    if (appOptions.help === true) {
        // print help and return...
        processHelpCommand();
        return;
    }

    const ffmpegVideoConverter = new FFMPEGVideoConverter(appLogger, fileManager, appOptions.ffmpegCommand, appOptions.ffprobeCommand);

    appLogger.LogDebug("checking to see if we have access to ffmpeg and ffprobe", {});
    const commandCheckResult = await ffmpegVideoConverter.checkCommands();
    if (!commandCheckResult.success) {
        appOutputWriter.writeLine("check for ffmpeg and ffprobe failed");
        appLogger.LogError("check for ffmpeg and ffprobe failed", new Error("ffmpeg or ffprobe are not installed?"), { commandCheckResult });
        return;
    }

    appLogger.LogDebug("ffmpeg and ffprobe found on system", { commandCheckResult });
    appOutputWriter.writeLine("ffmpeg and ffprobe found on system");

    let runner: IRunner;
    switch (appOptions.runMode) {
        case "stand-alone":
            runner = new StandAloneRunner(appLogger, appOutputWriter, appOptions, fileManager);
            break;
        default:
            appLogger.LogError("", new Error("run mode specified is not supported"), { runMode: appOptions.runMode });
            appOutputWriter.writeLine(`run mode specified is not supported: ${appOptions.runMode}`);
            return -1;
    }

    await runner.run();

    function processHelpCommand() {
        appLogger.LogInfo("help command invoked", {});
        PrintHelp();
        appLogger.LogInfo("help command finished", {});
    }

})().then(() => {
    // FIXME: make sure we are canceling any running jobs. handler interrupts like Ctrl+C?
    process.exit();
});
