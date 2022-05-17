import {
    IFileManager
} from './../../FileManager';
import {
    CheckVideoIntegrityOptions,
    VideoConvertOptions,
    VideoIntegrityIssues
} from './../models';
import {
    ILogger
} from './../../Logger/Logger';
import {
    FileInfo
} from "../../FileManager";
import {
    CommandRunner
} from "../CommandRunner";
import {
    CommandCheckResult,
    CommandStdErrMessageReceivedEventData,
    GetVideoInfoOptions,
    VideoConverterEventName_StdErrMessageReceived,
    GetVideoInfoResult,
    VideoInfo,
    CheckVideoIntegrityResult,
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
    ConvertVideoResult,
    VideoStreamInfo,
    AudioStreamInfo
} from "../models";
import {
    dirname
} from 'path';
import {
    bytesToHumanReadableBytes,
    millisecondsToHHMMSS
} from '../../PrettyPrint';
import {
    GET_INFO_COMMAND_TIMEOUT_MILLISECONDS
} from '../../Jobs/CheckVideoIntegrityJob';

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
        const commandResult = await this.executeCommand(this._ffmpegCommand, ffmpegArgs, checkCommandsCommandID, 10000000);
        this._logger.LogVerbose("finished check of command", commandResult);
        const ffprobeArgs = ["-L"];
        const ffprobeResult = await this.executeCommand(this._ffprobeCommand, ffprobeArgs, checkCommandsCommandID, 10000000);
        this._logger.LogVerbose("finished check of command", ffprobeResult);
        const duration = commandResult.durationMilliseconds + ffprobeResult.durationMilliseconds;
        return {
            commandID: checkCommandsCommandID,
            success: commandResult.success === true && ffprobeResult.success === true,
            durationMilliseconds: duration,
            durationPretty: millisecondsToHHMMSS(duration),
            statusCode: commandResult.exitCode ?? -999,
            commandErrOutput: commandResult.success === true ? undefined : commandResult.fullStdErrOutput,
            commandStdOutput: commandResult.success === true ? undefined : commandResult.fullOutput,
            results: [
                {
                    command: this._ffmpegCommand,
                    args: ffmpegArgs,
                    success: commandResult.success,
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

    public async checkVideoIntegrity(sourceFile: FileInfo, options: CheckVideoIntegrityOptions): Promise<CheckVideoIntegrityResult> {
        const start = Date.now();
        let isVideoGood = true;
        const issues: VideoIntegrityIssues = {
            audioStreamMissing: false,
            containerInfoMissing: false,
            getVideoInfoFailed: false,
            isEmptyFile: false,
            videoStreamIsRaw: false,
            videoStreamMissing: false,
        };
        if (sourceFile.size === 0) {
            const durationMilliseconds = Date.now() - start;
            issues.isEmptyFile = true;
            return {
                commandID: options.commandID,
                durationMilliseconds,
                durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                statusCode: -999,
                fileInfo: sourceFile,
                integrityCheck: {
                    isVideoGood: false,
                    issues,
                },
                success: true,
            }
        }
        let videoInfo: VideoInfo | undefined = options.sourceVideoInfoOptions;

        if (videoInfo === undefined) {
            const getVideoInfoResult = await this.getVideoInfo(sourceFile, {
                commandID: options.commandID,
                timeoutMilliseconds: options.timeoutMilliseconds,
                xArgs: [], // FIXME: need to be able to pass more options in for sub commands...
            });
            if (getVideoInfoResult.success === false) {
                // this is an integrity check failure condition
                issues.getVideoInfoFailed = true;
                const durationMilliseconds = Date.now() - start;
                return {
                    commandID: options.commandID,
                    failureReason: "get info call failed for file",
                    durationMilliseconds,
                    durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                    statusCode: -999,
                    fileInfo: sourceFile,
                    integrityCheck: {
                        isVideoGood: false,
                        issues,
                    },
                    success: false,
                    commandErrOutput: getVideoInfoResult.commandErrOutput,
                    commandStdOutput: getVideoInfoResult.commandStdOutput,
                }
            }
            videoInfo = getVideoInfoResult.videoInfo;
        }

        const videoStreamInfo = videoInfo.streams.find(s => s.codec_type === "video") as (VideoStreamInfo | undefined);
        if (videoStreamInfo === undefined) {
            issues.videoStreamMissing = true;
            isVideoGood = false;
        } else {
            // do other video checks
            if (videoStreamInfo.codec_name.toLowerCase() === "rawvideo") {
                issues.videoStreamIsRaw = true;
                isVideoGood = false;
            }
        }
        const audioStreamInfo = videoInfo.streams.find(s => s.codec_type === "audio") as (AudioStreamInfo | undefined);
        if (audioStreamInfo === undefined) {
            issues.audioStreamMissing = true;
            isVideoGood = false;
        } else {
            // do other audio checks?
        }
        const containerFormatInfo = videoInfo.format
        if (containerFormatInfo === undefined) {
            issues.containerInfoMissing = true;
            isVideoGood = false;
        } else {
            // do other container checks?
        }

        const durationMilliseconds = Date.now() - start;
        return {
            commandID: options.commandID,
            durationMilliseconds,
            durationPretty: millisecondsToHHMMSS(durationMilliseconds),
            integrityCheck: {
                isVideoGood,
                issues,
            },
            fileInfo: sourceFile,
            videoInfo: videoInfo,
            statusCode: 0,
            success: true,
        }
    }

    public async getVideoInfo(sourceFile: FileInfo, options: GetVideoInfoOptions): Promise<GetVideoInfoResult> {
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
        const commandResult = await this.executeCommand(this._ffprobeCommand, args, `GetVideoInfo-${options.commandID}`, options.timeoutMilliseconds);
        const joinedCommandOutput = commandResult.fullOutput.join("");
        const videoInfo: VideoInfo = JSON.parse(joinedCommandOutput);
        this._logger.LogVerbose("video info retrieved", { videoInfo })
        return {
            commandID: options.commandID,
            durationMilliseconds: commandResult.durationMilliseconds,
            durationPretty: millisecondsToHHMMSS(commandResult.durationMilliseconds),
            fileInfo: sourceFile,
            success: commandResult.success,
            statusCode: commandResult.exitCode ?? -999,
            commandErrOutput: commandResult.success === true ? undefined : commandResult.fullStdErrOutput,
            commandStdOutput: commandResult.success === true ? undefined : commandResult.fullOutput,
            videoInfo,
        };
    }

    public async convertVideo(sourceFileInfo: FileInfo, options: VideoConvertOptions): Promise<ConvertVideoResult> {
        const start = Date.now();
        this._logger.LogDebug("attempting to convert a video", { sourceFile: sourceFileInfo, options });
        const sourceVideoIntegrityCheckResult = await this.checkVideoIntegrity(sourceFileInfo, {
            commandID: options.commandID,
            timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
            xArgs: [],
        })
        if (sourceVideoIntegrityCheckResult.success === false) {
            const durationMilliseconds = Date.now() - start
            return {
                commandID: options.commandID,
                failureReason: "source file failed integrity get info call",
                sourceFileInfo,
                commandErrOutput: sourceVideoIntegrityCheckResult.commandErrOutput,
                commandStdOutput: sourceVideoIntegrityCheckResult.commandStdOutput,
                sourceVideoInfo: sourceVideoIntegrityCheckResult.videoInfo,
                sourceFileIntegrityCheck: sourceVideoIntegrityCheckResult.integrityCheck,
                convertedFileSize: 0,
                durationMilliseconds,
                durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                prettyConvertedFileSize: bytesToHumanReadableBytes(0),
                sizeDifference: 0,
                sizeDifferencePretty: bytesToHumanReadableBytes(0),
                statusCode: -999,
                success: false,
            };
        } else if (sourceVideoIntegrityCheckResult.integrityCheck.isVideoGood === false) {
            const durationMilliseconds = Date.now() - start
            return {
                commandID: options.commandID,
                failureReason: "source file failed integrity check",
                sourceFileInfo,
                sourceVideoInfo: sourceVideoIntegrityCheckResult.videoInfo,
                sourceFileIntegrityCheck: sourceVideoIntegrityCheckResult.integrityCheck,
                convertedFileSize: 0,
                durationMilliseconds,
                durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                prettyConvertedFileSize: bytesToHumanReadableBytes(0),
                sizeDifference: 0,
                sizeDifferencePretty: bytesToHumanReadableBytes(0),
                statusCode: -999,
                success: false,
            };
        }
        const targetFilePath: string = dirname(options.targetFileFullPath)
        this._fileManager.makeDir(targetFilePath);
        let args: string[] = [
            "-hide_banner",
            "-i",
            `"${sourceFileInfo.fullPath}"`,
            "-c:v",
            options.targetVideoEncoding,
            "-c:a",
            options.targetAudioEncoding,
            "-metadata",
            `convertedby="video-converter"`,
            ...options.xArgs,
            `"${options.targetFileFullPath}"`,
        ];
        if (options.useCuda === true) {
            args = ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-extra_hw_frames", "4", ...args];
        }
        const commandResult = await this.executeCommand(this._ffmpegCommand, args, options.commandID, options.timeoutMilliseconds);
        if (commandResult.success === true) {
            const targetFileInfo: FileInfo = (this._fileManager.getFSItemFromPath(options.targetFileFullPath) as FileInfo);
            const targetFileIntegrityCheckResult = await this.checkVideoIntegrity(targetFileInfo, {
                commandID: options.commandID,
                timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
                xArgs: [],
            });
            if (targetFileIntegrityCheckResult.success === false) {
                const durationMilliseconds = Date.now() - start
                return {
                    commandID: options.commandID,
                    failureReason: "source file failed integrity get info call",
                    sourceFileInfo,
                    commandErrOutput: sourceVideoIntegrityCheckResult.commandErrOutput,
                    commandStdOutput: sourceVideoIntegrityCheckResult.commandStdOutput,
                    sourceVideoInfo: sourceVideoIntegrityCheckResult.videoInfo,
                    sourceFileIntegrityCheck: sourceVideoIntegrityCheckResult.integrityCheck,
                    targetFileInfo,
                    targetVideoInfo: targetFileIntegrityCheckResult.videoInfo,
                    targetFileIntegrityCheck: targetFileIntegrityCheckResult.integrityCheck,
                    convertedFileSize: 0,
                    durationMilliseconds,
                    durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                    prettyConvertedFileSize: bytesToHumanReadableBytes(0),
                    sizeDifference: 0,
                    sizeDifferencePretty: bytesToHumanReadableBytes(0),
                    statusCode: -999,
                    success: false,
                };
            } else if (targetFileIntegrityCheckResult.integrityCheck.isVideoGood === false) {
                const durationMilliseconds = Date.now() - start
                return {
                    commandID: options.commandID,
                    failureReason: "source file failed integrity check",
                    sourceFileInfo,
                    sourceVideoInfo: sourceVideoIntegrityCheckResult.videoInfo,
                    sourceFileIntegrityCheck: sourceVideoIntegrityCheckResult.integrityCheck,
                    targetFileInfo,
                    targetVideoInfo: targetFileIntegrityCheckResult.videoInfo,
                    targetFileIntegrityCheck: targetFileIntegrityCheckResult.integrityCheck,
                    convertedFileSize: 0,
                    durationMilliseconds,
                    durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                    prettyConvertedFileSize: bytesToHumanReadableBytes(0),
                    sizeDifference: 0,
                    sizeDifferencePretty: bytesToHumanReadableBytes(0),
                    statusCode: -999,
                    success: false,
                };
            }
            const sizeDiff = sourceFileInfo.size - targetFileInfo.size;
            return {
                commandID: options.commandID,
                durationMilliseconds: commandResult.durationMilliseconds,
                durationPretty: millisecondsToHHMMSS(commandResult.durationMilliseconds),
                success: commandResult.success,
                sourceFileInfo: sourceFileInfo,
                sourceVideoInfo: sourceVideoIntegrityCheckResult.videoInfo,
                sourceFileIntegrityCheck: sourceVideoIntegrityCheckResult.integrityCheck,
                targetFileInfo,
                targetVideoInfo: targetFileIntegrityCheckResult.videoInfo,
                targetFileIntegrityCheck: targetFileIntegrityCheckResult.integrityCheck,
                sizeDifference: sizeDiff,
                sizeDifferencePretty: bytesToHumanReadableBytes(sizeDiff),
                convertedFileSize: targetFileInfo.size,
                prettyConvertedFileSize: bytesToHumanReadableBytes(targetFileInfo.size),
                statusCode: commandResult.exitCode ?? -999,

            }
        }
        return {
            commandID: options.commandID,
            failureReason: "convert command failed",
            durationMilliseconds: commandResult.durationMilliseconds,
            durationPretty: millisecondsToHHMMSS(commandResult.durationMilliseconds),
            success: commandResult.success,
            sourceFileInfo: sourceFileInfo,
            sourceVideoInfo: sourceVideoIntegrityCheckResult.videoInfo,
            sourceFileIntegrityCheck: sourceVideoIntegrityCheckResult.integrityCheck,
            sizeDifference: 0,
            sizeDifferencePretty: bytesToHumanReadableBytes(0),
            convertedFileSize: 0,
            prettyConvertedFileSize: bytesToHumanReadableBytes(0),
            statusCode: commandResult.exitCode ?? -999,
            commandErrOutput: commandResult.fullStdErrOutput,
            commandStdOutput: commandResult.fullOutput,
        }
    }
}