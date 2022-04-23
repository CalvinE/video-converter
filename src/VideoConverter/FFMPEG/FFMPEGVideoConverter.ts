import { IFileManager } from './../../FileManager';
import { VideoInfo, COPY } from './../models';
import { randomUUID } from 'crypto';
import { ILogger } from './../../Logger/Logger';
import { FileInfo } from "../../FileManager";
import { CommandRunner } from "../CommandRunner";
import {
    VideoConvertOptions,
    IVideoConverter,
    CommandStartedEventData,
    CommandRunningEventData,
    CommandMessageReceivedEventData,
    CommandFinishedEventData,
    CommandErroredEventData,
    CommandTimedoutEventData,
    VideoConverterEventName_Started,
    VideoConverterEventName_Running,
    VideoConverterEventName_MessageReceived,
    VideoConverterEventName_Finished,
    VideoConverterEventName_Errored,
    VideoConverterEventName_Timedout,
    VideoConvertResult,
} from "../models";
import { join } from 'path';

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
    public override async checkCommand(_: string[]): Promise<boolean> {
        this._logger.LogDebug("checking to see if command can be run.", { command: this._ffmpegCommand })
        const ffmpegResult = await this.executeCommand(this._ffmpegCommand, ["-h"], "test-ffmpeg", 10000000);
        this._logger.LogDebug("finished check of command", ffmpegResult);
        const ffProbeResult = await this.executeCommand(this._ffprobeCommand, ["-L"], "test-ffprobe", 10000000);
        this._logger.LogDebug("finished check of command", ffProbeResult);
        return ffmpegResult?.success === true && ffProbeResult?.success === true
    }

    protected override emitStarted(data: CommandStartedEventData) {
        this.emit(VideoConverterEventName_Started, data);
    }

    protected override emitRunning(data: CommandRunningEventData) {
        this.emit(VideoConverterEventName_Running, data);
    }

    protected emitMessageReceived(data: CommandMessageReceivedEventData) {
        this.emit(VideoConverterEventName_MessageReceived, data);
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
    public async GetVideoInfo(sourceFile: FileInfo): Promise<VideoInfo> {
        const args = [
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            `"${sourceFile.fullPath}"`,
        ];
        const commandResults = await this.executeCommand(this._ffprobeCommand, args, `GetVideoInfo-${randomUUID()}`, 0)
        const joinedCommandOutput = commandResults.fullOutput.join("");
        const videoInfo: VideoInfo = JSON.parse(joinedCommandOutput);
        this._logger.LogVerbose("video info retreived", { videoInfo })
        return videoInfo;
    }

    // TODO: add command timeout parameter
    public async ConvertVideo(sourceFile: FileInfo, options: VideoConvertOptions): Promise<VideoConvertResult> {
        // TODO: craft the ffmpeg command.")
        this._logger.LogDebug("attempting to convert a video", { sourceFile, options });
        this._fileManager.makeDir(options.savePath);
        const targetFilePath = join(options.savePath,)
        const commandResult = await this.executeCommand(this._ffmpegCommand, [], `ConvertVideoCodec-${randomUUID()}`, 0);
        // TODO: compute pre and post size, stuff like that?
        return {
            duration: commandResult.durationMilliseconds,
            success: commandResult.success,

        }
    }

    private getTargetFileFullPath(sourceFile: FileInfo, options: VideoConvertOptions): string {
        let targetFileName = options.targetFileName;
        if (targetFileName === "") {
            let containerFormat = sourceFile.extension.toLowerCase();
            const targetContainerFormat = options.targetContainerFormat.toLocaleLowerCase();
            if (targetContainerFormat &&
                targetContainerFormat !== COPY &&
                containerFormat !== targetContainerFormat) {
                containerFormat = targetContainerFormat;
            }
            let fileNameWithoutExtension = sourceFile.name.substring(0, sourceFile.name.lastIndexOf(".") - 1);
            if (options.targetFileName !== "") {

            }
        }
        const fullTargetPath = join(options.savePath, targetFileName)
        return fullTargetPath;
    }
}