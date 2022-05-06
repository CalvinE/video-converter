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

    constructor(logger: ILogger, fileManager: IFileManager, ffmpegCommand: string, ffprobeCommand: string) {
        super(logger);
        this._logger = logger;
        this._fileManager = fileManager;
        this._ffmpegCommand = ffmpegCommand ?? "ffmpeg";
        this._ffprobeCommand = ffprobeCommand ?? "ffprobe";
    }

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

    public async getVideoInfo(sourceFile: FileInfo, options: GetVideoInfoOptions): Promise<VideoGetInfoResult> {
        const args = [
            "-hide_banner",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            ...options.xArgs,
            `"${sourceFile.fullPath}"`,
        ];
        const commandResults = await this.executeCommand(this._ffprobeCommand, args, `GetVideoInfo-${options.commandID}`, options.timeoutMilliseconds);
        const joinedCommandOutput = commandResults.fullOutput.join("");
        const videoInfo: VideoInfo = JSON.parse(joinedCommandOutput);
        this._logger.LogVerbose("video info retrieved", { videoInfo })
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
        let args: string[] = [
            "-hide_banner",
            "-i",
            `"${sourceFile.fullPath}"`,
            "-c:v",
            options.targetVideoEncoding,
            "-c:a",
            options.targetAudioEncoding,
            ...options.xArgs,
            `"${options.targetFileFullPath}"`,
        ];
        if (options.useCuda === true) {
            args = ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-extra_hw_frames", "4", ...args];
        }
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
                convertedFileSize: targetFileInfo.size,
                prettyConvertedFileSize: bytesToHumanReadableBytes(targetFileInfo.size),
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
            convertedFileSize: 0,
            prettyConvertedFileSize: bytesToHumanReadableBytes(0),
        }
    }
}