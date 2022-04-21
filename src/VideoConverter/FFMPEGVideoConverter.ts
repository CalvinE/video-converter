import { FileInfo } from "../FileManager";
import { CommandRunner } from "./CommandRunner";
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
} from "./models";


export class FFMPEGVideoConverter extends CommandRunner implements IVideoConverter {
    private _ffmpegCommand: string;

    constructor(ffmpegCommand: string) {
        super();
        // TODO: test to see if command worked?
        this._ffmpegCommand = ffmpegCommand ?? "ffmpeg";
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
        const commandResult = await this.executeCommand(this._ffmpegCommand, [], "test1", 0);
        // TODO: compute pre and post size, stuff like that?
        return {
            duration: commandResult.durationMilliseconds,
            success: commandResult.success
        }
    }

    public async ConvertVideoContainer(sourceFile: FileInfo, options: ConvertVideoContainerOptions): Promise<ConvertVideoContainerResult> {
        // TODO: craft the ffmpeg command.
        const commandResult = await this.executeCommand(this._ffmpegCommand, [], "test2", 0);
        // TODO: compute pre and post size, stuff like that?
        return {
            duration: commandResult.durationMilliseconds,
            success: commandResult.success
        }
    }
}