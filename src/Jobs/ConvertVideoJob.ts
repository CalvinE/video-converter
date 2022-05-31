import { FileInfo } from './../FileManager';
import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { ConvertVideoJobResult, getCommandID, VideoInfo, IntegrityCheckResult, CheckVideoIntegrityCommandResult, ConvertVideoCommandResult, GetVideoInfoCommandResult, CommandStdErrMessageReceivedEventData, ConvertJobOptions, VideoConverterEventName_StdErrMessageReceived, VideoStreamInfo } from '../VideoConverter/models';
import { BaseJob } from "./BaseJob";
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

    protected _handleJobFailureCleanup(): void {
        delete this._jobOptions.result?.convertCommandResult;
        delete this._jobOptions.result?.sourceCheckVideoIntegrityCommandResult;
        delete this._jobOptions.result?.targetCheckVideoIntegrityCommandResult;
        delete this._jobOptions.result?.failureReason;
        this._logger.LogDebug("attempting to clean up failed job data.", { job: this._jobOptions });
        const targetFileFullPath = this._jobOptions.commandOptions.targetFileFullPath;
        if (targetFileFullPath !== "") {
            this._outputWriter.writeLine(`attempting to delete target file if it exists ${targetFileFullPath}`);
            this._fileManager.safeUnlinkFile(targetFileFullPath);
            if (this._fileManager.exists(targetFileFullPath)) {
                this._logger.LogWarn("failed to clean up failed job data", { targetFileFullPath });
                this._outputWriter.writeLine(`failed to clean up failed job data ${targetFileFullPath}`);
            } else {
                this._logger.LogInfo("successfully removed failed job file data", { targetFileFullPath });
                this._outputWriter.writeLine(`successfully removed failed job file data`);
            }
        }
    }

    protected async _execute(): Promise<ConvertVideoJobResult> {
        const start = Date.now();
        let sizeBeforeConvert = 0;
        let sizeAfterConvert = 0;
        let failureReason: string | undefined;
        let convertCommandResult: ConvertVideoCommandResult | undefined;
        let targetFileInfo: FileInfo | undefined;
        let targetVideoInfo: VideoInfo | undefined;
        let targetVideoIntegrityCheck: IntegrityCheckResult | undefined;
        let targetCheckVideoIntegrityResult: CheckVideoIntegrityCommandResult | undefined;
        this._logger.LogDebug("getting video file info so that we can calculate progressive updates", {});
        const {
            integrityCheckFailureReason: sourceIntegrityCheckFailureReason,
            videoIntegrityCheckCommandResult: sourceCheckVideoIntegrityCommandResult
        } = await this.checkVideoIntegrity(this._jobOptions.fileInfo, "", false)
        failureReason = sourceIntegrityCheckFailureReason;
        if (failureReason === undefined) {
            sizeBeforeConvert = this._jobOptions.fileInfo.size;
            this._outputWriter.writeLine(`converting file: ${this._jobOptions.fileInfo.fullPath}`);
            this._outputWriter.writeLine(`video encoder => ${this._jobOptions.commandOptions.targetVideoEncoding}`);
            this._outputWriter.writeLine(`audio encoder => ${this._jobOptions.commandOptions.targetAudioEncoding}`);
            this._outputWriter.writeLine(`container format => ${this._jobOptions.commandOptions.targetContainerFormat}`);
            this._outputWriter.writeLine(`target file => ${this._jobOptions.commandOptions.targetFileFullPath}`);
            let targetFileExists = this._fileManager.exists(this._jobOptions.commandOptions.targetFileFullPath);
            const clobberExistingFile = targetFileExists && this._jobOptions.allowClobberExisting;
            if (clobberExistingFile) {
                this._logger.LogWarn("deleting existing converted file because of job options", { allowClobberExisting: this._jobOptions.allowClobberExisting });
                this._outputWriter.writeLine("target file exists deleting because of settings provided.");
                const deleted = this._fileManager.safeUnlinkFile(this._jobOptions.commandOptions.targetFileFullPath);
                this._logger.LogWarn("attempted file delete complete", { deleted });
                if (deleted === true) {
                    this._logger.LogInfo("file deleted successfully", { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
                    targetFileExists = false;
                }
                else {
                    this._logger.LogWarn("existing file failed to delete!", { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
                    this._outputWriter.writeLine("failed to delete existing target file");
                }
            }
            if (targetFileExists) {
                if (!this._jobOptions.skipConvertExisting) {
                    const err = new Error(`file already exists. Dont want to clobber it: ${this._jobOptions.commandOptions.targetFileFullPath}`);
                    this._logger.LogError("not configured to clobber file and file exists...", err, { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
                    throw err;
                } else {
                    const msg = "skipping conversion of file because the target file exists and skipConvertExisting is true";
                    this._logger.LogWarn(msg, { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
                    this._outputWriter.writeLine(msg);
                }
            } else {
                const ffmpegConvertCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand)
                const convertCommandID = getCommandID("convert");
                const convertPromise = ffmpegConvertCommand.convertVideo(this._jobOptions.fileInfo, this._jobOptions.jobID, convertCommandID, this._jobOptions.commandOptions);
                const numberOfFrames = this.parseNumberOfFrames(sourceCheckVideoIntegrityCommandResult.videoInfo);
                const totalDuration = this.parseTotalDuration(sourceCheckVideoIntegrityCommandResult.videoInfo);
                const outputHandler = this.buildConvertOutputHandler(this._logger, this._outputWriter, convertCommandID, numberOfFrames, totalDuration);
                ffmpegConvertCommand.on(VideoConverterEventName_StdErrMessageReceived, outputHandler);
                convertCommandResult = await convertPromise
                ffmpegConvertCommand.off(VideoConverterEventName_StdErrMessageReceived, outputHandler);
                if (convertCommandResult.success !== true) {
                    failureReason = "video convert failed."
                    this._logger.LogInfo("attempting to delete file from failed job", { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
                    this._fileManager.safeUnlinkFile(this._jobOptions.commandOptions.targetFileFullPath);
                }
            }
            if (failureReason === undefined) {
                const {
                    integrityCheckFailureReason: targetIntegrityCheckFailureReason,
                    videoIntegrityCheckCommandResult: targetVideoIntegrityCheckCommandResult
                } = await this.checkVideoIntegrity(null, this._jobOptions.commandOptions.targetFileFullPath, true);
                failureReason = targetIntegrityCheckFailureReason;
                sizeAfterConvert = targetVideoIntegrityCheckCommandResult.fileInfo.size;
                targetCheckVideoIntegrityResult = targetVideoIntegrityCheckCommandResult;
                targetFileInfo = targetVideoIntegrityCheckCommandResult.fileInfo;
                targetVideoInfo = targetVideoIntegrityCheckCommandResult.videoInfo;
                targetVideoIntegrityCheck = targetVideoIntegrityCheckCommandResult.integrityCheck;
            }
        }
        // write an empty line to advance the progressive update line
        this.success = failureReason === undefined;
        if (this.success === true && this._jobOptions.saveInPlace === true) {
            // Hmm this is a conundrum... if I unlink the original and place the converted in its place with its name... do I need to recompute the file info and integrity check at this point too?
        }
        const sizeDifference = this.success === true ? sizeAfterConvert - sizeBeforeConvert : 0;
        const durationMilliseconds = Date.now() - start;
        this._outputWriter.writeLine("");
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
            convertCommandResult: convertCommandResult?.success === false ? convertCommandResult : undefined,
            targetCheckVideoIntegrityCommandResult: targetCheckVideoIntegrityResult?.success === false ? targetCheckVideoIntegrityResult : undefined,
        };
    }

    private async checkVideoIntegrity(videoFileInfo: FileInfo | null, videoFileFullPath: string, isConvertedFile: boolean): Promise<{
        integrityCheckFailureReason: string,
        videoIntegrityCheckCommandResult: CheckVideoIntegrityCommandResult,
        success: boolean,
    }> {
        let integrityCheckFailureReason = "";
        const fileInfo = videoFileInfo !== null ? videoFileInfo : this._fileManager.getFSItemFromPath(videoFileFullPath) as FileInfo;
        const videoIntegrityCheckCommand = new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand);
        const targetIntegrityCheckCommandID = getCommandID("checkvideointegrity");
        const videoIntegrityCheckCommandResult = await videoIntegrityCheckCommand.checkVideoIntegrity(fileInfo, this._jobOptions.jobID, targetIntegrityCheckCommandID, this._jobOptions.getVideoInfoCommandOptions);
        if (videoIntegrityCheckCommandResult.success === false) {
            integrityCheckFailureReason = "failed to perform video integrity check";
            this._logger.LogWarn(integrityCheckFailureReason, { fullPath: fileInfo.fullPath });
            this._outputWriter.writeLine(integrityCheckFailureReason);
        } else if (videoIntegrityCheckCommandResult.integrityCheck.isVideoGood === false) {
            integrityCheckFailureReason = "converted file failed integrity check";
            this._logger.LogWarn(integrityCheckFailureReason, { videoIntegrityCheckResult: videoIntegrityCheckCommandResult });
            this._outputWriter.writeLine(`${integrityCheckFailureReason}: see logs for more details`)
            if (isConvertedFile === true && this._jobOptions.keepInvalidConvertResult === false) {
                const msg = "deleting invalid converted file per keepInvalidConvertResult being set to false";
                this._logger.LogWarn(msg, {
                    invalidConvertedFile: fileInfo.fullPath,
                    isConvertedFile,
                    keepInvalidConvertResult: this._jobOptions.keepInvalidConvertResult,
                });
                this._outputWriter.writeLine(msg);
                // TODO: add property to file info to indicate a file as been deleted?
                const deleted = this._fileManager.safeUnlinkFile(fileInfo.fullPath);
                if (deleted === false) {
                    const msg = "failed to delete invalid converted file";
                    this._logger.LogWarn(msg, {
                        invalidConvertedFile: fileInfo.fullPath,
                    });
                    this._outputWriter.writeLine(msg);
                }
            }
        }
        const success = integrityCheckFailureReason === "" && videoIntegrityCheckCommandResult.success === true && videoIntegrityCheckCommandResult.integrityCheck.isVideoGood === true;
        return {
            integrityCheckFailureReason,
            videoIntegrityCheckCommandResult,
            success,
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
