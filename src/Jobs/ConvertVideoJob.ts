import { IVideoConverter } from './../VideoConverter/models';
import { TEMP_FILE_PREFIX } from './JobFactory';
import { FileInfo } from './../FileManager';
import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { ConvertVideoJobResult, getCommandID, VideoInfo, IntegrityCheckResult, CheckVideoIntegrityCommandResult, ConvertVideoCommandResult, CommandStdErrMessageReceivedEventData, ConvertJobOptions, VideoConverterEventName_StdErrMessageReceived, VideoStreamInfo } from '../VideoConverter/models';
import { BaseJob } from "./BaseJob";
import { bytesToHumanReadableBytes, HHMMSSmmToSeconds, millisecondsToHHMMSS } from '../PrettyPrint';
import { normalizeString } from '../util';

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

    // TODO: handle save in place job option. I.E. save to a temp file and after conversion and integrity check unlink previous file and rename the converted temp file with the right name.
    protected async _execute(): Promise<ConvertVideoJobResult> {
        const start = Date.now();
        const willOverwrite = this._jobOptions.fileInfo.fullPath === this._jobOptions.commandOptions.targetFileFullPath;
        let targetFileFullPath = this._jobOptions.commandOptions.targetFileFullPath;
        if (willOverwrite === true) {
            if (this._jobOptions.allowClobberExisting === true) {
                targetFileFullPath = this._fileManager.joinPath(this._jobOptions.fileInfo.pathToItem, `${TEMP_FILE_PREFIX}${this._jobOptions.fileInfo.name}`)
                this._logger.LogWarn("target and source file are the same path and name. will overwrite the file. for conversion writing to temp file.", { tempFileFullPath: targetFileFullPath })
            } else {
                const err = new Error(`file already exists. Dont want to clobber it: ${this._jobOptions.commandOptions.targetFileFullPath}`);
                this._logger.LogError("not configured to clobber file and file exists...", err, { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
                throw err;
            }
        }
        let sizeBeforeConvert = 0;
        let sizeAfterConvert = 0;
        let failureReason: string | undefined;
        let convertCommandResult: ConvertVideoCommandResult | undefined;
        let targetFileInfo: FileInfo | undefined;
        let targetVideoInfo: VideoInfo | undefined;
        let targetVideoIntegrityCheck: IntegrityCheckResult | undefined;
        let targetCheckVideoIntegrityResult: CheckVideoIntegrityCommandResult | undefined;
        let skipped = false;
        let skippedReason: string | undefined;
        this._logger.LogDebug("getting video file info so that we can calculate progressive updates", {});
        const {
            integrityCheckFailureReason: sourceIntegrityCheckFailureReason,
            videoIntegrityCheckCommandResult: sourceCheckVideoIntegrityCommandResult
        } = await this.checkVideoIntegrity(this._jobOptions.fileInfo, "", false)
        failureReason = sourceIntegrityCheckFailureReason;
        if (failureReason === undefined) {
            skipped = this.checkSkipVideoCodecName(this._jobOptions.skipVideoCodecName, sourceCheckVideoIntegrityCommandResult.videoInfo);
            if (!skipped) {
                sizeBeforeConvert = this._jobOptions.fileInfo.size;
                this._outputWriter.writeLine(`converting file: ${this._jobOptions.fileInfo.fullPath}`);
                this._outputWriter.writeLine(`video encoder => ${this._jobOptions.commandOptions.targetVideoEncoding}`);
                this._outputWriter.writeLine(`audio encoder => ${this._jobOptions.commandOptions.targetAudioEncoding}`);
                this._outputWriter.writeLine(`container format => ${this._jobOptions.commandOptions.targetContainerFormat}`);
                this._outputWriter.writeLine(`target file => ${this._jobOptions.commandOptions.targetFileFullPath}`);
                let targetFileExists = this._fileManager.exists(targetFileFullPath);
                const clobberExistingFile = targetFileExists && this._jobOptions.allowClobberExisting;
                if (clobberExistingFile) {
                    this._logger.LogWarn("deleting existing converted file because of job options", { allowClobberExisting: this._jobOptions.allowClobberExisting });
                    this._outputWriter.writeLine("target file exists deleting because of settings provided.");
                    const deleted = this._fileManager.safeUnlinkFile(targetFileFullPath);
                    this._logger.LogWarn("attempted file delete complete", { deleted });
                    if (deleted === true) {
                        this._logger.LogInfo("file deleted successfully", { targetFileFullPath: targetFileFullPath });
                        targetFileExists = false;
                    }
                    else {
                        this._logger.LogWarn("existing file failed to delete!", { targetFileFullPath: targetFileFullPath });
                        this._outputWriter.writeLine("failed to delete existing target file");
                    }
                }
                if (targetFileExists) {
                    if (!this._jobOptions.skipConvertExisting) {
                        const err = new Error(`file already exists. Dont want to clobber it: ${targetFileFullPath}`);
                        this._logger.LogError("not configured to clobber file and file exists...", err, { targetFileFullPath: targetFileFullPath });
                        throw err;
                    } else {
                        const msg = "skipping conversion of file because the target file exists and skipConvertExisting is true";
                        this._logger.LogWarn(msg, { targetFileFullPath: targetFileFullPath });
                        this._outputWriter.writeLine(msg);
                        skipped = true;
                        skippedReason = msg;
                    }
                } else {
                    const ffmpegConvertCommand: IVideoConverter = new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand)
                    const convertCommandID = getCommandID("convert");
                    const convertPromise = ffmpegConvertCommand.convertVideo(this._jobOptions.fileInfo, this._jobOptions.jobID, convertCommandID, {
                        ...this._jobOptions.commandOptions,
                        targetFileFullPath, // here we overwrite this incase we need to save to temp file in case of potential overwrite...
                    });
                    const numberOfFrames = this.parseNumberOfFrames(sourceCheckVideoIntegrityCommandResult.videoInfo);
                    const totalDuration = this.parseTotalDuration(sourceCheckVideoIntegrityCommandResult.videoInfo);
                    const outputHandler = this.buildConvertOutputHandler(this._logger, this._outputWriter, convertCommandID, numberOfFrames, totalDuration);
                    ffmpegConvertCommand.on(VideoConverterEventName_StdErrMessageReceived, outputHandler);
                    convertCommandResult = await convertPromise
                    ffmpegConvertCommand.off(VideoConverterEventName_StdErrMessageReceived, outputHandler);
                    if (convertCommandResult.success !== true) {
                        failureReason = "video convert failed."
                        this._logger.LogInfo("attempting to delete file from failed job", { targetFileFullPath });
                        this._fileManager.safeUnlinkFile(targetFileFullPath);
                    }
                }
                if (failureReason === undefined) {
                    const {
                        integrityCheckFailureReason: targetIntegrityCheckFailureReason,
                        videoIntegrityCheckCommandResult: targetVideoIntegrityCheckCommandResult,
                        success: targetVideoIntegrityVCheckSuccessful,
                    } = await this.checkVideoIntegrity(null, targetFileFullPath, true);
                    failureReason = targetIntegrityCheckFailureReason;
                    sizeAfterConvert = targetVideoIntegrityCheckCommandResult.fileInfo.size;
                    targetCheckVideoIntegrityResult = targetVideoIntegrityCheckCommandResult;
                    targetFileInfo = targetVideoIntegrityCheckCommandResult.fileInfo;
                    targetVideoInfo = targetVideoIntegrityCheckCommandResult.videoInfo;
                    targetVideoIntegrityCheck = targetVideoIntegrityCheckCommandResult.integrityCheck;
                    if (targetVideoIntegrityVCheckSuccessful === true) {
                        if (this._jobOptions.deleteSourceAfterConvert) {
                            this._fileManager.unlinkFile(this._jobOptions.fileInfo.fullPath);
                        }
                        if (targetCheckVideoIntegrityResult.fileInfo.name.indexOf(TEMP_FILE_PREFIX) >= 0) {
                            const msg = "file name contains temp token, removing and renaming file";
                            this._logger.LogInfo(msg, {});
                            this._outputWriter.writeLine(msg);
                            // This is a temp file name and the temp part needs to be removed...
                            const newTargetFileFullPath = targetCheckVideoIntegrityResult.fileInfo.fullPath.replace(TEMP_FILE_PREFIX, "");
                            // Just a note here... this will overwrite existing file if the name after the temp token is removed is identical to an existing file... Do we want an exists check here, or is that ok?
                            this._fileManager.renameFile(targetCheckVideoIntegrityResult.fileInfo.fullPath, newTargetFileFullPath);
                            const {
                                integrityCheckFailureReason: targetIntegrityCheckFailureReason,
                                videoIntegrityCheckCommandResult: targetVideoIntegrityCheckCommandResult,
                            } = await this.checkVideoIntegrity(null, newTargetFileFullPath, true);
                            failureReason = targetIntegrityCheckFailureReason;
                            targetFileInfo = targetVideoIntegrityCheckCommandResult.fileInfo;
                            targetVideoInfo = targetVideoIntegrityCheckCommandResult.videoInfo;
                            targetVideoIntegrityCheck = targetVideoIntegrityCheckCommandResult.integrityCheck;
                        }
                    }
                }
            } else {
                skippedReason = "skipped because video codec name matched skipVideoCodecName option";
                this._outputWriter.writeLine(skippedReason);
                this._logger.LogWarn(skippedReason, { skipVideoCodecName: this._jobOptions.skipVideoCodecName })
            }
        }
        // write an empty line to advance the progressive update line
        this.success = failureReason === undefined;
        let sizeDifference = 0;
        // TODO: determine how this is handled if the stuff was skipped per this._jobOptions.skipConvertExisting
        if (this.success === true) {
            sizeDifference = sizeAfterConvert - sizeBeforeConvert;
            if (willOverwrite === true) {
                this._fileManager.unlinkFile(this._jobOptions.fileInfo.fullPath);
                this._fileManager.renameFile(targetFileFullPath, this._jobOptions.fileInfo.fullPath)
                // Hmm this is a conundrum... if I unlink the original and place the converted in its place with its name... do I need to recompute the file info and integrity check at this point too?
                // TODO: rerun integrity check?
            } else if (this._jobOptions.deleteSourceAfterConvert === true) {
                // delete the source at this point...
                const deleted = this._fileManager.safeUnlinkFile(this._jobOptions.fileInfo.fullPath);
                if (deleted === true) {
                    this._logger.LogInfo("source file deleted successfully", { targetFileFullPath: targetFileFullPath });
                }
                else {
                    this._logger.LogWarn("source file failed to delete!", { targetFileFullPath: targetFileFullPath });
                    this._outputWriter.writeLine("failed to delete source target file");
                }
            }
        }
        // const sizeDifference = this.success === true ? sizeAfterConvert - sizeBeforeConvert : 0;
        const durationMilliseconds = Date.now() - start;
        this._outputWriter.writeLine("");
        return {
            jobID: this._jobOptions.jobID,
            success: this.success,
            skipped,
            skippedReason,
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
        const videoIntegrityCheckCommandResult = await videoIntegrityCheckCommand.checkVideoIntegrity(fileInfo, this._jobOptions.jobID, targetIntegrityCheckCommandID, this._jobOptions.checkVideoIntegrityCommandOptions);
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

    /**
     * This function checks if the first video stream codec name is the same as the codec name passed in (case insensitive)
     * @param videoInfo The info on the video being checked.
     * @param videoCodecToSkip The name of the video codec to skip. For example: hevc
     */
    private checkSkipVideoCodecName(videoCodecToSkip: string, videoInfo?: VideoInfo): boolean {
        const videoStream = videoInfo?.streams.find(s => s.codec_type === "video");
        if (videoStream === undefined) {
            const msg = "video stream not found for skip video codec check"
            const err = new Error(msg);
            this._logger.LogError("unable to find video stream for file...", err, { videoInfo, videoCodecToSkip });
            this._outputWriter.writeLine(msg);
            throw err;
        }
        if (normalizeString(videoStream.codec_name) === normalizeString(videoCodecToSkip)) {
            return true;
        }
        return false;
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
