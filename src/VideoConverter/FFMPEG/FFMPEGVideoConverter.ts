import { ILogger } from './../../Logger/Logger';
import { FileInfo } from "../../FileManager";
import { CommandRunner } from "../CommandRunner";
import {
    ConvertVideoCodecOptions,
    ConvertVideoContainerOptions,
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
    ConvertVideoCodecResult,
    ConvertVideoContainerResult,
} from "../models";


export class FFMPEGVideoConverter extends CommandRunner implements IVideoConverter {

    constructor(ffmpegCommand: string, logger: ILogger) {
        super(ffmpegCommand, logger);
        this._logger = logger;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public override async checkCommand(_: string[]): Promise<boolean> {
        this._logger.LogDebug("checking to see if command can be run.", {command: this._command})
        const result = await this.executeCommand(["-h"], "test", 10000000);
        this._logger.LogDebug("finished check of command", result);
        return result?.success === true
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


    public async ConvertVideoCodec(sourceFile: FileInfo, options: ConvertVideoCodecOptions): Promise<ConvertVideoCodecResult> {
        // TODO: craft the ffmpeg command.
        const commandResult = await this.executeCommand([], "test1", 0);
        // TODO: compute pre and post size, stuff like that?
        return {
            duration: commandResult.durationMilliseconds,
            success: commandResult.success
        }
    }

    public async ConvertVideoContainer(sourceFile: FileInfo, options: ConvertVideoContainerOptions): Promise<ConvertVideoContainerResult> {
        // TODO: craft the ffmpeg command.
        const commandResult = await this.executeCommand([], "test2", 0);
        // TODO: compute pre and post size, stuff like that?
        return {
            duration: commandResult.durationMilliseconds,
            success: commandResult.success
        }
    }
}