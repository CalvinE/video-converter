import { ConvertVideoJobResult, getCommandID, VideoInfo, IntegrityCheckResult, CheckVideoIntegrityCommandResult } from './../VideoConverter/models';
import { FileInfo } from './../FileManager';
import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { CommandStdErrMessageReceivedEventData, ConvertJobOptions, VideoConverterEventName_StdErrMessageReceived, VideoStreamInfo } from '../VideoConverter/models';
import { BaseJob } from "./BaseJob";
import { GET_INFO_COMMAND_TIMEOUT_MILLISECONDS } from './GetVideoInfoJob';
import { bytesToHumanReadableBytes, HHMMSSmmToSeconds, millisecondsToHHMMSS } from '../PrettyPrint';

const PROGRESSIVE_UPDATE_CHAR_WIDTH = 40;
export const CONVERT_VIDEO_JOB_NAME = "convertVideo";

const FFMPEG_CURRENT_FRAME_REGEX = /frame=\s*(?<framenumber>\d+)/i;
const FFMPEG_CURRENT_TIME_REGEX = /time=\s*(?<duration>\d{2,}:\d{2}:\d{2}\.?\d*)/i;

export class ConvertVideoJob extends BaseJob<ConvertJobOptions, ConvertVideoJobResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: ConvertJobOptions) {
        super(logger, outputWriter, fileManager, options)
    }

    public validateJobOptions(): boolean {
        throw new Error('Method not implemented.');
    }

    public getJobTypeName(): string {
        return CONVERT_VIDEO_JOB_NAME;
    }

    protected async _execute(): Promise<ConvertVideoJobResult> {
        const start = Date.now();
        let sizeBeforeConvert = 0;
        let sizeAfterConvert = 0;
        let failureReason: string | undefined;
        let targetFileInfo: FileInfo | undefined;
        let targetVideoInfo: VideoInfo | undefined;
        let targetVideoIntegrityCheck: IntegrityCheckResult | undefined;
        let targetCheckVideoIntegrityResult: CheckVideoIntegrityCommandResult | undefined;
        const sourceIntegrityCheckCommandID = getCommandID("checkvideointegrity");
        this._logger.LogDebug("getting video file info so that we can calculate progressive updates", { commandID: sourceIntegrityCheckCommandID, })
        const getSourceInfoFFMPEGCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand);
        const sourceCheckVideoIntegrityCommandResult = await getSourceInfoFFMPEGCommand.checkVideoIntegrity(this._jobOptions.fileInfo, this._jobOptions.jobID, sourceIntegrityCheckCommandID, {
            timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
            xArgs: [],
        })
        if (sourceCheckVideoIntegrityCommandResult.success === false) {
            this._logger.LogWarn("failed to get video info", { videoInfoResult: sourceCheckVideoIntegrityCommandResult })
        }
        sizeBeforeConvert = this._jobOptions.fileInfo.size;
        this._outputWriter.writeLine(`converting file: ${this._jobOptions.fileInfo.fullPath}`);
        this._outputWriter.writeLine(`video encoder => ${this._jobOptions.commandOptions.targetVideoEncoding}`);
        this._outputWriter.writeLine(`audio encoder => ${this._jobOptions.commandOptions.targetAudioEncoding}`);
        this._outputWriter.writeLine(`container format => ${this._jobOptions.commandOptions.targetContainerFormat}`);
        this._outputWriter.writeLine(`target file => ${this._jobOptions.commandOptions.targetFileFullPath}`);
        if (this._fileManager.exists(this._jobOptions.commandOptions.targetFileFullPath)) {
            // TODO: add an allow clobber flag that will remove files if they are present? or do not and let the logic above for resuming aborted and errored jobs handle it?
            throw new Error("file already exists. Dont want to clobber it.")
        }
        const ffmpegConvertCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand)
        const convertCommandID = getCommandID("convert");
        const convertPromise = ffmpegConvertCommand.convertVideo(this._jobOptions.fileInfo, this._jobOptions.jobID, convertCommandID, this._jobOptions.commandOptions);
        const numberOfFrames = this.parseNumberOfFrames(sourceCheckVideoIntegrityCommandResult.videoInfo);
        const totalDuration = this.parseTotalDuration(sourceCheckVideoIntegrityCommandResult.videoInfo);
        const outputHandler = this.buildConvertOutputHandler(this._logger, this._outputWriter, convertCommandID, numberOfFrames, totalDuration);
        ffmpegConvertCommand.on(VideoConverterEventName_StdErrMessageReceived, outputHandler);
        const convertCommandResult = await convertPromise
        ffmpegConvertCommand.off(VideoConverterEventName_StdErrMessageReceived, outputHandler);
        if (convertCommandResult.success === true) {
            targetFileInfo = this._fileManager.getFSItemFromPath(convertCommandResult.targetFileFullPath ?? "") as FileInfo;
            const targetFileVideoInfoCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand);
            const targetIntegrityCheckCommandID = getCommandID("checkvideointegrity");
            targetCheckVideoIntegrityResult = await targetFileVideoInfoCommand.checkVideoIntegrity(targetFileInfo, this._jobOptions.jobID, targetIntegrityCheckCommandID, {
                timeoutMilliseconds: GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
                xArgs: [],
            });
            targetVideoInfo = targetCheckVideoIntegrityResult.videoInfo;
            targetVideoIntegrityCheck = targetCheckVideoIntegrityResult.integrityCheck;
            sizeAfterConvert = targetFileInfo.size;
            if (targetCheckVideoIntegrityResult.success === false) {
                const msg = "failed to perform video integrity check converted file";
                this._logger.LogWarn(msg, { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
                this._outputWriter.writeLine(msg);
            } else if (targetCheckVideoIntegrityResult.integrityCheck.isVideoGood === false && this._jobOptions.keepInvalidConvertResult === false) {
                const msg = "resulting file failed integrity check. deleting converted file per keepInvalidConvertResult being set to false";
                this._logger.LogWarn(msg, {
                    invalidConvertedFile: targetFileInfo.fullPath,
                });
                this._outputWriter.writeLine(msg);
                const deleted = this._fileManager.safeUnlinkFile(targetFileInfo.fullPath);
                if (deleted === false) {
                    const msg = "failed to delete invalid converted file";
                    this._logger.LogWarn(msg, {
                        invalidConvertedFile: targetFileInfo.fullPath,
                    });
                    this._outputWriter.writeLine(msg);
                }
            }

        } else {
            this._logger.LogInfo("attempting to delete file from failed job", { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
            this._fileManager.safeUnlinkFile(this._jobOptions.commandOptions.targetFileFullPath);
            this.success = true;
        }
        // write an empty line to advance the progressive update line
        this._outputWriter.writeLine("");
        const sizeDifference = this.success === true ? sizeAfterConvert - sizeBeforeConvert : 0;
        const durationMilliseconds = Date.now() - start;
        this.success = sourceCheckVideoIntegrityCommandResult.success === true && convertCommandResult.success === true && targetCheckVideoIntegrityResult?.success === true;
        return {
            jobID: this._jobOptions.jobID,
            success: this.success,
            sizeDifference,
            sizeDifferencePretty: bytesToHumanReadableBytes(sizeDifference),
            convertedFileSize: sizeAfterConvert,
            prettyConvertedFileSize: bytesToHumanReadableBytes(sizeAfterConvert),
            durationMilliseconds,
            durationPretty: millisecondsToHHMMSS(durationMilliseconds),
            failureReason,
            sourceFileInfo: sourceCheckVideoIntegrityCommandResult.fileInfo,
            sourceVideoInfo: sourceCheckVideoIntegrityCommandResult.videoInfo,
            sourceVideoIntegrityCheck: sourceCheckVideoIntegrityCommandResult.integrityCheck,
            targetFileInfo,
            targetVideoInfo,
            targetVideoIntegrityCheck,
            sourceCheckVideoIntegrityCommandResult: sourceCheckVideoIntegrityCommandResult.success === false ? sourceCheckVideoIntegrityCommandResult : undefined,
            convertCommandResult: convertCommandResult.success === false ? convertCommandResult : undefined,
            targetCheckVideoIntegrityCommandResult: targetCheckVideoIntegrityResult?.success === false ? targetCheckVideoIntegrityResult : undefined,
        };
    }

    private parseNumberOfFrames(videoInfo?: VideoInfo): number {
        const videoStream: VideoStreamInfo | undefined = (videoInfo?.streams?.find(s => s?.codec_type === "video") as VideoStreamInfo);
        const numberOfFrames = videoStream?.nb_frames;
        const numberOfFramesNumber = parseInt(numberOfFrames ?? "-1", 10);
        return numberOfFramesNumber;
    }

    private parseTotalDuration(videoInfo?: VideoInfo): number {
        const videoStream: VideoStreamInfo | undefined = (videoInfo?.streams?.find(s => s?.codec_type === "video") as VideoStreamInfo);
        const videoStreamDurationString = videoStream?.duration;
        if (videoStreamDurationString !== undefined) {
            const videoContainerDurationNumber = parseFloat(videoStreamDurationString);
            if (!isNaN(videoContainerDurationNumber)) {
                return videoContainerDurationNumber;
            }
        }
        const totalContainerDurationString = videoInfo?.format?.duration;
        if (totalContainerDurationString !== undefined) {
            const totalDurationNumber = parseFloat(totalContainerDurationString);
            if (isNaN(totalDurationNumber)) {
                return totalDurationNumber;
            }
        }
        return -1;
    }

    private noopProgressiveUpdate(): (args: CommandStdErrMessageReceivedEventData) => void {
        // lets show that something is happening...
        return () => {
            return;
        };
    }

    private naiveProgressiveUpdate(_logger: ILogger, outputWriter: IOutputWriter, commandID: string): (args: CommandStdErrMessageReceivedEventData) => void {
        // lets show that something is happening...
        let messageCount = 0;
        return (args: CommandStdErrMessageReceivedEventData) => {
            if (args.commandID == commandID) {
                if (messageCount % 10 === 0) {
                    outputWriter.write(".");
                }
                messageCount++;
            }
            return;
        }
    }

    private frameCountBasedProgressiveUpdate(logger: ILogger, outputWriter: IOutputWriter, commandID: string, totalNumberOfFrames: number): (args: CommandStdErrMessageReceivedEventData) => void {
        return (args: CommandStdErrMessageReceivedEventData) => {
            if (args.commandID === commandID) {
                const regexMatch = args.commandMessage.match(FFMPEG_CURRENT_FRAME_REGEX);
                const currentFrameString = regexMatch?.groups?.framenumber;
                if (!currentFrameString) {
                    logger.LogVerbose("could not find current frame in received message", { message: args.commandMessage });
                    return;
                }
                logger.LogVerbose("current frame found", { commandID, currentFrame: currentFrameString, numberOfFrames: totalNumberOfFrames })
                if (currentFrameString) {
                    const currentFrameNumber = parseInt(currentFrameString, 10);
                    logger.LogVerbose("current duration parsed", { currentFrameString, currentFrameNumber });
                    const progressiveUpdate = this.makeProgressiveUpdateLine(logger, commandID, currentFrameNumber, totalNumberOfFrames);
                    outputWriter.write(`${progressiveUpdate}\r`);
                }
            }
        }
    }

    private durationCountBasedProgressiveUpdate(logger: ILogger, outputWriter: IOutputWriter, commandID: string, totalDuration: number): (args: CommandStdErrMessageReceivedEventData) => void {
        return (args: CommandStdErrMessageReceivedEventData) => {
            if (args.commandID === commandID) {
                const regexMatch = args.commandMessage.match(FFMPEG_CURRENT_TIME_REGEX);
                const currentDurationString = regexMatch?.groups?.duration;
                if (!currentDurationString) {
                    logger.LogVerbose("could not find current duration in received message", { message: args.commandMessage });
                    return;
                }
                logger.LogVerbose("current duration found", { commandID, currentDurationString, totalDuration })
                if (currentDurationString) {
                    const currentDurationSeconds = HHMMSSmmToSeconds(currentDurationString);
                    logger.LogVerbose("current duration parsed", { currentDurationString, currentDurationSeconds });
                    const progressiveUpdate = this.makeProgressiveUpdateLine(logger, commandID, currentDurationSeconds, totalDuration);
                    outputWriter.write(`${progressiveUpdate}\r`);
                }
            }
        }
    }

    private makeProgressiveUpdateLine(logger: ILogger, commandID: string, currentValueNumber: number, totalValue: number): string {
        const pctDone = Math.floor(currentValueNumber / totalValue * 100);
        const numMarkers = Math.floor(pctDone / 5);
        logger.LogVerbose("percent done calculated", { commandID, totalValue, currentValueNumber, pctDone, numMarkers });
        const arrow = `${"=".repeat(numMarkers ?? 0)}>`.padEnd(20, " ")
        const progressiveUpdate = `|${arrow}| %${pctDone}`.padEnd(PROGRESSIVE_UPDATE_CHAR_WIDTH, " ");
        return progressiveUpdate;
    }

    private buildConvertOutputHandler(logger: ILogger, outputWriter: IOutputWriter, commandID: string, numberOfFrames: number, totalDuration: number): (args: CommandStdErrMessageReceivedEventData) => void {
        const doProgressiveUpdates = outputWriter.supportsProgressiveUpdates();
        let makeProgressiveUpdateFunction: (args: CommandStdErrMessageReceivedEventData) => void = this.naiveProgressiveUpdate(logger, outputWriter, commandID);
        if (!doProgressiveUpdates) {
            // default to noop updated
            logger.LogDebug("disabling progressive updated because the output writer does not support progressive updates.", { numberOfFrames, totalDuration, commandID });
            makeProgressiveUpdateFunction = this.noopProgressiveUpdate();
        } else if (totalDuration > -1) {
            logger.LogDebug("video duration is available. setting progressive updates to duration based updates.", { numberOfFrames, totalDuration, commandID });
            makeProgressiveUpdateFunction = this.durationCountBasedProgressiveUpdate(logger, outputWriter, commandID, totalDuration);
        } else if (numberOfFrames > -1) {
            logger.LogDebug("video total frame count is available. setting progressive updates to current frame based updates.", { numberOfFrames, totalDuration, commandID });
            makeProgressiveUpdateFunction = this.frameCountBasedProgressiveUpdate(logger, outputWriter, commandID, numberOfFrames);
        } else {
            logger.LogDebug("no data available for progressive updates. resorting to naive updates", { numberOfFrames, totalDuration, commandID });
        }
        return makeProgressiveUpdateFunction;
    }

}
