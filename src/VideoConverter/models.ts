import { randomUUID } from "crypto";
import { FileInfo } from "../FileManager";
import { AppOptions } from "../OptionsParser";

/**
 * @description This options is valid for video container format, audio codec, and video codec. When set it uses the value of the source file.
 * 
 */
export const COPY = "copy";
export const INVALID = "invalid";

export type SubCommand = "convert" | "getinfo" | `${typeof INVALID}`;

export type Task = SubCommand | `${typeof COPY}`;

export type State = "pending" | "running" | "completed" | "error" | "invalidfile";

export type BaseJobOptions = {
  commandID: string;
  host: string;
  failureReason?: string;
  fileInfo: FileInfo;
  state: State;
  task: string;
}

export type ConvertJobOptions = BaseJobOptions & {
  task: "convert";
  options: VideoConvertOptions;
  result?: VideoConvertResult;
}

export type GetInfoJobOptions = BaseJobOptions & {
  task: "getinfo";
  options: GetVideoInfoOptions;
  result?: VideoGetInfoResult;
}

export type CopyJobOptions = BaseJobOptions & {
  task: "copy";
  targetFileFullPath: string;
  result?: CopyResult;
};

export type JobOptions = (ConvertJobOptions | GetInfoJobOptions | CopyJobOptions);

// export type Job = CopyJobOptions | ConvertJobOptions | GetInfoJobOptions;

export type JobsOptionsArray = Array<JobOptions>;

export type JobFile = {
  jobID: string;
  jobName: string;
  options: AppOptions;
  jobs: JobsOptionsArray;
  numJobs: number;
  numCompletedJobs: number;
  numFailedJobs: number;
  totalSizeBeforeProcessing: number;
  prettyTotalSizeBeforeProcessing: string;
  totalSizeAfterProcessing: number;
  prettyTotalSizeAfterProcessing: string;
  percentSizeChange: number;
  totalSizeChangeBytes: number;
  prettyTotalSizeChange: string;
  durationMilliseconds: number;
  prettyDuration: string;
  percentDone: number;
  failedJobIDs: string[];
}

export const VideoContainerFormat_MP4 = "mp4";
export const VideoContainerFormat_MOV = "mov";
export const VideoContainerFormat_AVI = "avi";

export type VideoContainerFormat = string | `${typeof COPY}`;

// FIXME: Having this hard coded is an issue, we should pull encoders from the `ffmpeg -codecs` command?
export const LibX265VideoEncoder = "libx265";

export type VideoEncoder = `${typeof LibX265VideoEncoder | typeof COPY | typeof INVALID}`;

// FIXME: Having this hard coded is an issue, we should pull encoders from the `ffmpeg -codecs` command?
export type AudioEncoder = `${typeof COPY | typeof INVALID}`;

export const VideoConverterEventName_Started = "starting"
export const VideoConverterEventName_Running = "running"
export const VideoConverterEventName_StdOutMessageReceived = "stdout-message-received"
export const VideoConverterEventName_StdErrMessageReceived = "stderr-message-received"
export const VideoConverterEventName_Finished = "finished"
export const VideoConverterEventName_Errored = "errored"
export const VideoConverterEventName_Timedout = "timedout"

export type VideoConverterEvent = `${typeof VideoConverterEventName_Started | typeof VideoConverterEventName_Running | typeof VideoConverterEventName_StdOutMessageReceived | typeof VideoConverterEventName_Finished | typeof VideoConverterEventName_Errored | typeof VideoConverterEventName_Timedout}`;

export const CommandStateName_Pending = "pending"
export const CommandStateName_Started = "started"
export const CommandStateName_Running = "running"
export const CommandStateName_Finished = "finished"
export const CommandStateName_Errored = "error"
export const CommandStateName_TimedOut = "timeout"

export type CommandState = `${typeof CommandStateName_Pending | typeof CommandStateName_Started | typeof CommandStateName_Running | typeof CommandStateName_Finished | typeof CommandStateName_Errored | typeof CommandStateName_TimedOut}`


type BaseVideoConverterOptions = {
  commandID: string;
  timeoutMilliseconds: number;
  xArgs: string[];
};

export type GetVideoInfoOptions = BaseVideoConverterOptions;

export type VideoConvertOptions = BaseVideoConverterOptions & {
  useCuda: boolean;
  targetFileFullPath: string;
  targetVideoEncoding: VideoEncoder;
  targetAudioEncoding: AudioEncoder;
};

export type BaseJobResult = {
  commandID: string;
  duration: number;
  durationPretty: string;
  success: boolean;
  statusCode: number;
  commandStdOutput?: string[];
  commandErrOutput?: string[];
}

export type CommandCheckResult = BaseJobResult & {
  results: Array<{
    command: string,
    args: string[],
    success: boolean,
  }>;
}

export type VideoGetInfoResult = BaseJobResult & {
  size: number;
  videoInfo: VideoInfo;
  sourceFileFullPath: string;
}

export type VideoConvertResult = BaseJobResult & {
  targetFileInfo?: FileInfo;
  convertedFileSize: number;
  prettyConvertedFileSize: string;
  sizeDifference: number;
  sizeDifferencePretty: string;
  sourceFileFullPath: string;
};

export type CopyResult = BaseJobResult & {
  targetFileInfo?: FileInfo;
};

type BaseVideoConverterEvent = {
  commandId: string;
  currentState: CommandState;
  elapsedTimeMilliseconds: number;
  elapsedTimePretty: string;
  pid?: number;
}

export type CommandStartedEventData = BaseVideoConverterEvent;

export type CommandRunningEventData = BaseVideoConverterEvent;

export type CommandStdOutMessageReceivedEventData = BaseVideoConverterEvent & {
  commandMessage: string;
};

export type CommandStdErrMessageReceivedEventData = CommandStdOutMessageReceivedEventData;

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


export interface IVideoConverter {
  getVideoInfo: (sourceFile: FileInfo, options: GetVideoInfoOptions) => Promise<VideoGetInfoResult>;
  convertVideo: (sourceFile: FileInfo, options: VideoConvertOptions) => Promise<VideoConvertResult>;
}

export function getVideoInfoCommandID(): string {
  return `getVideoInfo-${randomUUID()}`
}

export function getConvertVideoCommandID(): string {
  return `convertVideoCodec-${randomUUID()}`
}

export function getJobCommandID(task: Task): string {
  return `${task}-${randomUUID()}`
}

export function getJobID(): string {
  return `job-${randomUUID()}`
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
