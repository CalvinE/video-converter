import { FileInfo } from "../FileManager";

/**
 * @description This options is valid for video container format, audio codec, and video codec. When set it uses the value of the source file.
 * 
 */
export const COPY = "copy";
export const VideoContainerFormat_MP4 = "mp4";
export const VideoContainerFormat_MOV = "mov";
export const VideoContainerFormat_AVI = "avi";

export type VideoContainerFormat = `${typeof VideoContainerFormat_MP4 | typeof VideoContainerFormat_MOV | typeof VideoContainerFormat_AVI | typeof COPY}`;

export type VideoEncoding = `${typeof COPY}`;

export type AudioEncoding = `${typeof COPY}`;

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
    targetFileName: string;
};

type BaseVideoConverterResult = {
    success: boolean;
    duration: number;
    sourceFileFullPath: string;
    targetFileFullpath: string;
    sizeDifference: number;
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
    fullOutput: string[];
};

export type CommandErroredEventData = BaseVideoConverterEvent & {
    code?: number;
    error?: Error,
};

export type CommandTimedoutEventData = BaseVideoConverterEvent & {
    timeoutMilliseconds: number;
};

export type VideoConvertOptions = BaseVideoConverterOptions & {
    targetVideoEncoding: VideoEncoding;
    targetAudioEncoding: AudioEncoding;
    targetContainerFormat: VideoContainerFormat;
};

export type VideoConvertResult = BaseVideoConverterResult;

export interface IVideoConverter {
    GetVideoInfo: (sourceFile: FileInfo) => Promise<VideoInfo>;
    ConvertVideo: (sourceFile: FileInfo, options: VideoConvertOptions) => Promise<VideoConvertResult>;
}

export type VideoInfo = {
    format: VideoFormatInfo;
    streams: Array<VideoStreamInfo | AudioStreamInfo>;
}

export type VideoFormatInfo = {
    filename: string;
    nb_streams: number;
    nb_programs: number;
    format_name: string;
    format_long_name: string;
    start_time: string;
    duration: string;
    size: string;
    bit_rate: string;
    probe_score: number;
    tags: VideoFormatTags;
  }

  export type VideoFormatTags = {
    major_brand: string;
    minor_version: string;
    compatible_brands: string;
    encoder: string;
  }
  

export type VideoStreamInfo = {
    index: number;
    codec_name: string;
    codec_long_name: string;
    profile: string;
    codec_type: "video";
    codec_tag_string: string;
    codec_tag: string;
    width: number;
    height: number;
    coded_width: number;
    coded_height: number;
    closed_captions: number;
    film_grain: number;
    has_b_frames: number;
    sample_aspect_ratio: string;
    display_aspect_ratio: string;
    pix_fmt: string;
    level: number;
    chroma_location: string;
    field_order: string;
    refs: number;
    is_avc: string;
    nal_length_size: string;
    id: string;
    r_frame_rate: string;
    avg_frame_rate: string;
    time_base: string;
    start_pts: number;
    start_time: string;
    duration_ts: number;
    duration: string;
    bit_rate: string;
    bits_per_raw_sample: string;
    nb_frames: string;
    extradata_size: number;
    disposition: VideoStreamInfoDisposition;
    tags: VideoStreamInfoTags;
  }

  export type VideoStreamInfoDisposition = {
    default: number;
    dub: number;
    original: number;
    comment: number;
    lyrics: number;
    karaoke: number;
    forced: number;
    hearing_impaired: number;
    visual_impaired: number;
    clean_effects: number;
    attached_pic: number;
    timed_thumbnails: number;
    captions: number;
    descriptions: number;
    metadata: number;
    dependent: number;
    still_image: number;
  }

  export type VideoStreamInfoTags = {
    language: string;
    handler_name: string;
    vendor_id: string;
  }
  
  export type AudioStreamInfo = {
    index: number;
    codec_name: string;
    codec_long_name: string;
    profile: string;
    codec_type: "audio";
    codec_tag_string: string;
    codec_tag: string;
    sample_fmt: string;
    sample_rate: string;
    channels: number;
    channel_layout: string;
    bits_per_sample: number;
    id: string;
    r_frame_rate: string;
    avg_frame_rate: string;
    time_base: string;
    start_pts: number;
    start_time: string;
    duration_ts: number;
    duration: string;
    bit_rate: string;
    nb_frames: string;
    extradata_size: number;
    disposition: AudioStreamInfoDisposition;
    tags: AudioStreamInfoTags;
  }

  export type AudioStreamInfoDisposition = {
    default: number;
    dub: number;
    original: number;
    comment: number;
    lyrics: number;
    karaoke: number;
    forced: number;
    hearing_impaired: number;
    visual_impaired: number;
    clean_effects: number;
    attached_pic: number;
    timed_thumbnails: number;
    captions: number;
    descriptions: number;
    metadata: number;
    dependent: number;
    still_image: number;
  }

  export type AudioStreamInfoTags = {
    language: string;
    handler_name: string;
    vendor_id: string;
  }
  