import { FileInfo } from "../FileManager";

export const VideoContainerFormat_MP4 = "mp4";
export const VideoContainerFormat_MOV = "mov";
export const VideoContainerFormat_AVI = "avi";

export type VideoContainer = `${typeof VideoContainerFormat_MP4 | typeof VideoContainerFormat_MOV | typeof VideoContainerFormat_AVI}`;



export type VideoEncoding = "";
export type AudioEncoding = "";

export const VideoConverterEventName_Started = "starting"
export const VideoConverterEventName_Running = "running"
export const VideoConverterEventName_MessageReceived = "message-received"
export const VideoConverterEventName_Finished = "finished"
export const VideoConverterEventName_Errored = "errored"
export const VideoConverterEventName_Timedout = "timedout"

export type VideoConverterEvent = `${typeof VideoConverterEventName_Started | typeof VideoConverterEventName_Running | typeof VideoConverterEventName_MessageReceived | typeof VideoConverterEventName_Finished | typeof VideoConverterEventName_Errored | typeof VideoConverterEventName_Timedout}`;

export const CommandStateName_Pending = "pending"
export const CommandStateName_Started = "started"
export const CommandStateName_Running = "running"
export const CommandStateName_Finished = "finished"
export const CommandStateName_Errored = "error"
export const CommandStateName_TimedOut = "timeout"

export type CommandState = `${typeof CommandStateName_Pending | typeof CommandStateName_Started | typeof CommandStateName_Running | typeof CommandStateName_Finished | typeof CommandStateName_Errored | typeof CommandStateName_TimedOut}`


type BaseVideoConverterOptions = {
    commmandID: string;
    savePath: string;
    targetContainer?: VideoContainer;
};

type BaseVideoConverterResult = {
    success: boolean;
    duration: number;
}

type BaseVideoConverterEvent = {
    commandId: string;
    currentState: CommandState;
    elapsedTimeMilliseconds: number
    pid?: number;
}

export type CommandStartedEventData = BaseVideoConverterEvent;

export type CommandRunningEventData = BaseVideoConverterEvent;

export type CommandMessageReceivedEventData = BaseVideoConverterEvent & {
    message: string;
};

export type CommandFinishedEventData = BaseVideoConverterEvent & {
    code?: number;
};

export type CommandErroredEventData = BaseVideoConverterEvent & {
    code?: number;
    error?: Error,
};

export type CommandTimedoutEventData = BaseVideoConverterEvent & {
    timeoutMilliseconds: number;
};

export type ConvertVideoCodecOptions = BaseVideoConverterOptions & {
    targetVideoEncoding?: VideoEncoding;
    targetAudioEncoding?: AudioEncoding;
};

export type ConvertVideoCodecResult = BaseVideoConverterResult;

export type ConvertVideoContainerOptions = BaseVideoConverterOptions;

export type ConvertVideoContainerResult = BaseVideoConverterResult;

export interface IVideoConverter {
    ConvertVideoCodec: (sourceFile: FileInfo, options: ConvertVideoCodecOptions) => Promise<ConvertVideoCodecResult>;
    ConvertVideoContainer: (sourceFile: FileInfo, options: ConvertVideoContainerOptions) => Promise<ConvertVideoContainerResult>;
}