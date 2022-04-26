import { IFileManager } from './../../FileManager';
import { CommandCheckResult, CommandStdErrMessageReceivedEventData, GetVideoInfoOptions, VideoConverterEventName_StdErrMessageReceived, VideoGetInfoResult, VideoInfo } from './../models';
import { ILogger } from './../../Logger/Logger';
import { FileInfo } from "../../FileManager";
import { CommandRunner } from "../CommandRunner";
import {
    VideoConvertOptions,
    IVideoConverter,
    CommandStartedEventData,
    CommandRunningEventData,
    CommandStdOutMessageReceivedEventData,
    CommandFinishedEventData,
    CommandErroredEventData,
    CommandTimedoutEventData,
    VideoConverterEventName_Started,
    VideoConverterEventName_Running,
    VideoConverterEventName_StdOutMessageReceived,
    VideoConverterEventName_Finished,
    VideoConverterEventName_Errored,
    VideoConverterEventName_Timedout,
    VideoConvertResult,
} from "../models";
import { dirname } from 'path';
import { bytesToHumanReadableBytes, millisecondsToHHMMSS } from '../../PrettyPrint';

export class FFMPEGVideoConverter extends CommandRunner implements IVideoConverter {

    private _ffmpegCommand: string
    private _ffprobeCommand: string
    private _fileManager: IFileManager;

    constructor(ffmpegCommand: string, ffprobeCommand: string, logger: ILogger, fileManager: IFileManager) {
        super(logger);
        this._logger = logger;
        this._fileManager = fileManager;
        this._ffmpegCommand = ffmpegCommand ?? "ffmpeg";
        this._ffprobeCommand = ffprobeCommand ?? "ffprobe";
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public override async checkCommands(): Promise<CommandCheckResult> {
        this._logger.LogVerbose("checking to see if command can be run.", { command: this._ffmpegCommand });
        const checkCommandsCommandID = "checkCommands";
        const ffmpegArgs = ["-h"];
        const ffmpegResult = await this.executeCommand(this._ffmpegCommand, ffmpegArgs, checkCommandsCommandID, 10000000);
        this._logger.LogVerbose("finished check of command", ffmpegResult);
        const ffprobeArgs = ["-L"];
        const ffprobeResult = await this.executeCommand(this._ffprobeCommand, ffprobeArgs, checkCommandsCommandID, 10000000);
        this._logger.LogVerbose("finished check of command", ffprobeResult);
        const duration = ffmpegResult.durationMilliseconds + ffprobeResult.durationMilliseconds;
        return {
            commandID: checkCommandsCommandID,
            success: ffmpegResult.success === true && ffprobeResult.success === true,
            duration: duration,
            durationPretty: millisecondsToHHMMSS(duration),
            results: [
                {
                    command: this._ffmpegCommand,
                    args: ffmpegArgs,
                    success: ffmpegResult.success,
                },
                {
                    command: this._ffprobeCommand,
                    args: ffprobeArgs,
                    success: ffprobeResult.success,
                },
            ],
        }
    }

    protected override emitStarted(data: CommandStartedEventData) {
        this.emit(VideoConverterEventName_Started, data);
    }

    protected override emitRunning(data: CommandRunningEventData) {
        this.emit(VideoConverterEventName_Running, data);
    }

    protected emitStdOutMessageReceived(data: CommandStdOutMessageReceivedEventData) {
        this.emit(VideoConverterEventName_StdOutMessageReceived, data);
    }

    protected emitStdErrMessageReceived(data: CommandStdErrMessageReceivedEventData) {
        this.emit(VideoConverterEventName_StdErrMessageReceived, data);
    }

    protected emitFinished(data: CommandFinishedEventData) {
        this.emit(VideoConverterEventName_Finished, data);
    }

    protected emitErrored(data: CommandErroredEventData) {
        this.emit(VideoConverterEventName_Errored, data);
    }

    protected emitTimedout(data: CommandTimedoutEventData) {
        this.emit(VideoConverterEventName_Timedout, data);
    }

    // TODO: add command timeout parameter
    public async getVideoInfo(sourceFile: FileInfo, options: GetVideoInfoOptions): Promise<VideoGetInfoResult> {
        const args = [
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            `"${sourceFile.fullPath}"`,
        ];
        const commandResults = await this.executeCommand(this._ffprobeCommand, args, `GetVideoInfo-${options.commandID}`, options.timeoutMilliseconds)
        const joinedCommandOutput = commandResults.fullOutput.join("");
        const videoInfo: VideoInfo = JSON.parse(joinedCommandOutput);
        this._logger.LogVerbose("video info retreived", { videoInfo })
        return {
            commandID: options.commandID,
            duration: commandResults.durationMilliseconds,
            durationPretty: millisecondsToHHMMSS(commandResults.durationMilliseconds),
            size: sourceFile.size,
            sourceFileFullPath: sourceFile.fullPath,
            success: commandResults.success,
            videoInfo,
        };
    }

    public async convertVideo(sourceFile: FileInfo, options: VideoConvertOptions): Promise<VideoConvertResult> {
        this._logger.LogDebug("attempting to convert a video", { sourceFile, options });
        const targetFilePath: string = dirname(options.targetFileFullPath)
        this._fileManager.makeDir(targetFilePath);
        const args: string[] = [
            "-i",
            `"${sourceFile.fullPath}"`,
            "-c:v",
            options.targetVideoEncoding,
            "-c:a",
            options.targetAudioEncoding,
            `"${options.targetFileFullPath}"`,
        ];
        const commandResult = await this.executeCommand(this._ffmpegCommand, args, options.commandID, options.timeoutMilliseconds);
        if (commandResult.success === true) {
            const targetFileInfo: FileInfo = (this._fileManager.getFSItemFromPath(options.targetFileFullPath) as FileInfo);
            const sizeDiff = sourceFile.size - targetFileInfo.size;
            return {
                commandID: options.commandID,
                duration: commandResult.durationMilliseconds,
                durationPretty: millisecondsToHHMMSS(commandResult.durationMilliseconds),
                success: commandResult.success,
                sourceFileFullPath: sourceFile.fullPath,
                targetFileFullPath: options.targetFileFullPath,
                sizeDifference: sizeDiff,
                sizeDifferencePretty: bytesToHumanReadableBytes(sizeDiff),
            }
        }
        return {
            commandID: options.commandID,
            duration: commandResult.durationMilliseconds,
            durationPretty: millisecondsToHHMMSS(commandResult.durationMilliseconds),
            success: commandResult.success,
            sourceFileFullPath: sourceFile.fullPath,
            targetFileFullPath: options.targetFileFullPath,
            sizeDifference: 0,
            sizeDifferencePretty: bytesToHumanReadableBytes(0),
        }
    }
}