import { TEMP_FILE_PREFIX } from './JobFactory';
import { MockVideoConverter } from './../VideoConverter/FFMPEG/MockVideoConverter';
import { IVideoConverter } from './../VideoConverter/models';
import { FileInfo } from '../FileManager/FileManager';
import { FFMPEGVideoConverter } from './../VideoConverter/FFMPEG/FFMPEGVideoConverter';
import { IFileManager } from '../FileManager/FileManager';
import { ILogger } from '../Logger';
import { IOutputWriter } from '../OutputWriter';
import { ConvertVideoJobResult, getCommandID, VideoInfo, CheckVideoIntegrityCommandResult, ConvertVideoCommandResult, CommandStdErrMessageReceivedEventData, ConvertJobOptions, VideoConverterEventName_StdErrMessageReceived, VideoStreamInfo } from '../VideoConverter/models';
import { BaseJob } from "./BaseJob";
import { bytesToHumanReadableBytes, HHMMSSmmToSeconds, millisecondsToHHMMSS } from '../PrettyPrint';
import { normalizeString } from '../util';

const PROGRESSIVE_UPDATE_CHAR_WIDTH = 40;
export const CONVERT_VIDEO_JOB_NAME = "convertVideo";

export const FAILURE_REASON_SOURCE_TARGET_SAME = "target file already exists this is not allowed use TEMP token in file name";
export const FAILURE_REASON_FAILED_TO_PERFORM_INTEGRITY_CHECK = "failed to perform video integrity check";
export const FAILURE_REASON_SOURCE_FAILED_INTEGRITY_CHECK = "source file failed integrity check";
export const FAILURE_REASON_TARGET_FAILED_INTEGRITY_CHECK = "target file failed integrity check";
export const FAILURE_REASON_FAILED_TO_CONVERT_VIDEO = "video convert failed";
export const FAILURE_REASON_CANNOT_CLOBBER_EXISTING_FILE = "not configured to clobber file and file exists";

const FFMPEG_CURRENT_FRAME_REGEX = /frame=\s*(?<framenumber>\d+)/i;
const FFMPEG_CURRENT_TIME_REGEX = /time=\s*(?<duration>\d{2,}:\d{2}:\d{2}\.?\d*)/i;

export class ConvertVideoJob extends BaseJob<ConvertJobOptions, ConvertVideoJobResult> {
    constructor(logger: ILogger, outputWriter: IOutputWriter, fileManager: IFileManager, options: ConvertJobOptions) {
        super(logger, outputWriter, fileManager, options);
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

    // FIXME: I am unhappy with how the nested ifs are structured here...
    protected async _execute(): Promise<ConvertVideoJobResult> {
        const start = Date.now();
        const result = this.getDefaultJobResult(this.GetJobID(), this.GetSourceFileInfo());
        const sizeBeforeConvert = this.GetSourceFileInfo().size;
        let convertedFileSize = 0;
        let sizeDifference = 0;
        let videoConvertCommandResult: ConvertVideoCommandResult | undefined;
        let targetCheckVideoIntegrityCommandResult: CheckVideoIntegrityCommandResult | undefined;
        const targetFileFullPath = this._jobOptions.commandOptions.targetFileFullPath;
        const willOverwrite: boolean = this.GetSourceFileInfo().fullPath === targetFileFullPath;
        if (willOverwrite === true) {
            result.failureReason = FAILURE_REASON_SOURCE_TARGET_SAME;
            const err = new Error(`file already exists. don't want to clobber it: ${this._jobOptions.commandOptions.targetFileFullPath}`);
            this._logger.LogError(result.failureReason, err, { targetFileFullPath: this._jobOptions.commandOptions.targetFileFullPath });
            const durationMilliseconds = Date.now() - start;
            return {
                ...result,
                durationMilliseconds,
                durationPretty: millisecondsToHHMMSS(durationMilliseconds),
            };
        }
        this._logger.LogDebug("getting video file info so that we can calculate progressive updates", {});
        const sourceIntegrityCheckResult = await this.checkVideoIntegrity(this.GetSourceFileInfo(), "", false);
        if (sourceIntegrityCheckResult.integrityCheckFailureReason !== undefined) {
            // logging is handled in this.checkVideoIntegrity
            result.failureReason = sourceIntegrityCheckResult.integrityCheckFailureReason;
            const durationMilliseconds = Date.now() - start;
            return {
                ...result,
                durationMilliseconds,
                durationPretty: millisecondsToHHMMSS(durationMilliseconds),
            };
        }
        const sourceCheckVideoIntegrityCommandResult = sourceIntegrityCheckResult.videoIntegrityCheckCommandResult;
        result.sourceVideoInfo = sourceCheckVideoIntegrityCommandResult.videoInfo;
        result.sourceVideoIntegrityCheck = sourceCheckVideoIntegrityCommandResult.integrityCheck;
        result.skipped = this.checkSkipVideoCodecName(this._jobOptions.skipVideoCodecName, sourceCheckVideoIntegrityCommandResult.videoInfo);
        if (!result.skipped) {
            this._outputWriter.writeLine(`converting file: ${this.GetSourceFileInfo().fullPath}`);
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
                if (this._jobOptions.skipConvertExisting !== true) {
                    const err = new Error(`file already exists. don't want to clobber it: ${targetFileFullPath}`);
                    this._logger.LogError(FAILURE_REASON_CANNOT_CLOBBER_EXISTING_FILE, err, { targetFileFullPath: targetFileFullPath });
                    result.failureReason = FAILURE_REASON_CANNOT_CLOBBER_EXISTING_FILE;
                } else {
                    const msg = "skipping conversion of file because the target file exists and skipConvertExisting is true";
                    this._logger.LogWarn(msg, { targetFileFullPath: targetFileFullPath });
                    this._outputWriter.writeLine(msg);
                    result.skipped = true;
                    result.skippedReason = msg;
                }
            } else {
                const ffmpegConvertCommand = this.makeVideoConverter(); //new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand)
                const convertCommandID = getCommandID("convert");
                const convertPromise = ffmpegConvertCommand.convertVideo(this.GetSourceFileInfo(), this._jobOptions.jobID, convertCommandID, {
                    ...this._jobOptions.commandOptions,
                    targetFileFullPath, // here we overwrite this incase we need to save to temp file in case of potential overwrite...
                });
                const numberOfFrames = this.parseNumberOfFrames(sourceCheckVideoIntegrityCommandResult.videoInfo);
                const totalDuration = this.parseTotalDuration(sourceCheckVideoIntegrityCommandResult.videoInfo);
                const outputHandler = this.buildConvertOutputHandler(this._logger, this._outputWriter, convertCommandID, numberOfFrames, totalDuration);
                ffmpegConvertCommand.on(VideoConverterEventName_StdErrMessageReceived, outputHandler);
                videoConvertCommandResult = await convertPromise;
                ffmpegConvertCommand.off(VideoConverterEventName_StdErrMessageReceived, outputHandler);
                if (videoConvertCommandResult.success !== true) {
                    result.failureReason = FAILURE_REASON_FAILED_TO_CONVERT_VIDEO;
                    this._logger.LogInfo("attempting to delete file from failed job", { targetFileFullPath });
                    this._fileManager.safeUnlinkFile(targetFileFullPath);
                }
            }
            if (result.failureReason !== undefined) {
                const durationMilliseconds = Date.now() - start;
                return {
                    ...result,
                    durationMilliseconds,
                    durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                };
            }
            const {
                integrityCheckFailureReason: targetIntegrityCheckFailureReason,
                videoIntegrityCheckCommandResult: targetVideoIntegrityCheckCommandResult,
                success: targetVideoIntegrityVCheckSuccessful,
            } = await this.checkVideoIntegrity(null, targetFileFullPath, true);
            result.failureReason = targetIntegrityCheckFailureReason;
            convertedFileSize = targetVideoIntegrityCheckCommandResult.fileInfo.size;
            targetCheckVideoIntegrityCommandResult = targetVideoIntegrityCheckCommandResult;
            result.targetFileInfo = targetVideoIntegrityCheckCommandResult.fileInfo;
            result.targetVideoInfo = targetVideoIntegrityCheckCommandResult.videoInfo;
            result.targetVideoIntegrityCheck = targetVideoIntegrityCheckCommandResult.integrityCheck;
            if (targetVideoIntegrityVCheckSuccessful === true) {
                if (targetCheckVideoIntegrityCommandResult.fileInfo.name.indexOf(TEMP_FILE_PREFIX) >= 0) {
                    const msg = "file name contains temp token, removing and renaming file";
                    this._logger.LogInfo(msg, {});
                    this._outputWriter.writeLine(msg);
                    // This is a temp file name and the temp part needs to be removed...
                    const newTargetFileFullPath = targetCheckVideoIntegrityCommandResult.fileInfo.fullPath.replace(TEMP_FILE_PREFIX, "");
                    // Just a note here... this will overwrite existing file if the name after the temp token is removed is identical to an existing file... Do we want an exists check here, or is that ok?
                    this._fileManager.renameFile(targetCheckVideoIntegrityCommandResult.fileInfo.fullPath, newTargetFileFullPath);
                    const {
                        integrityCheckFailureReason: targetIntegrityCheckFailureReason,
                        videoIntegrityCheckCommandResult: targetVideoIntegrityCheckCommandResult,
                    } = await this.checkVideoIntegrity(null, newTargetFileFullPath, true);
                    result.failureReason = targetIntegrityCheckFailureReason;
                    result.targetFileInfo = targetVideoIntegrityCheckCommandResult.fileInfo;
                    result.targetVideoInfo = targetVideoIntegrityCheckCommandResult.videoInfo;
                    result.targetVideoIntegrityCheck = targetVideoIntegrityCheckCommandResult.integrityCheck;
                }
            }
        } else {
            result.skippedReason = "skipped because video codec name matched skipVideoCodecName option";
            this._outputWriter.writeLine(result.skippedReason);
            this._logger.LogWarn(result.skippedReason, { skipVideoCodecName: this._jobOptions.skipVideoCodecName });
        }
        this.success = result.failureReason === undefined;
        // TODO: determine how this is handled if the stuff was skipped per this._jobOptions.skipConvertExisting
        if (this.success === true) {
            sizeDifference = convertedFileSize - sizeBeforeConvert;
            // if (willOverwrite === true) {
            //     this._fileManager.unlinkFile(this.GetSourceFileInfo().fullPath);
            //     this._fileManager.renameFile(targetFileFullPath, this.GetSourceFileInfo().fullPath)
            //     // Hmm this is a conundrum... if I unlink the original and place the converted in its place with its name... do I need to recompute the file info and integrity check at this point too?
            //     // TODO: rerun integrity check?
            // } else 
            if (!result.skipped && this._jobOptions.deleteSourceAfterConvert === true && this._jobOptions.sourceFileInfo.fullPath !== result.targetFileInfo?.fullPath) {

                // delete the source at this point...
                const deleted = this._fileManager.safeUnlinkFile(this.GetSourceFileInfo().fullPath);
                if (deleted === true) {
                    this._logger.LogInfo("source file deleted successfully", { targetFileFullPath: targetFileFullPath });
                }
                else {
                    this._logger.LogWarn("source file failed to delete!", { targetFileFullPath: targetFileFullPath });
                    this._outputWriter.writeLine("failed to delete source target file");
                }
                if (targetFileFullPath.indexOf(TEMP_FILE_PREFIX) >= 0) {
                    const newTargetFileFullPath = targetFileFullPath.replace(TEMP_FILE_PREFIX, "");
                    this._fileManager.renameFile(targetFileFullPath, newTargetFileFullPath);

                }
            }
        }
        // const sizeDifference = this.success === true ? sizeAfterConvert - sizeBeforeConvert : 0;
        const durationMilliseconds = Date.now() - start;
        // write an empty line to advance the progressive update line
        this._outputWriter.writeLine("");
        return {
            ...result,
            jobID: this._jobOptions.jobID,
            success: this.success,
            sizeDifference,
            sizeDifferencePretty: bytesToHumanReadableBytes(sizeDifference),
            convertedFileSize,
            prettyConvertedFileSize: bytesToHumanReadableBytes(convertedFileSize),
            durationMilliseconds,
            durationPretty: millisecondsToHHMMSS(durationMilliseconds),
            sourceCheckVideoIntegrityCommandResult: sourceCheckVideoIntegrityCommandResult?.success === false ? sourceCheckVideoIntegrityCommandResult : undefined,
            convertCommandResult: videoConvertCommandResult?.success === false ? videoConvertCommandResult : undefined,
            targetCheckVideoIntegrityCommandResult: targetCheckVideoIntegrityCommandResult?.success === false ? targetCheckVideoIntegrityCommandResult : undefined,
        };
    }

    private getDefaultJobResult(jobID: string, sourceFileInfo: FileInfo): ConvertVideoJobResult {
        return {
            jobID,
            convertedFileSize: 0,
            durationMilliseconds: 0,
            durationPretty: "",
            prettyConvertedFileSize: "",
            sizeDifference: 0,
            sizeDifferencePretty: "",
            skipped: false,
            sourceFileInfo,
            success: false,
        };
    }

    private async checkVideoIntegrity(videoFileInfo: FileInfo | null, videoFileFullPath: string, isConvertedFile: boolean): Promise<{
        integrityCheckFailureReason: string | undefined,
        videoIntegrityCheckCommandResult: CheckVideoIntegrityCommandResult,
        success: boolean,
    }> {
        let integrityCheckFailureReason: string | undefined;
        const fileInfo = videoFileInfo !== null ? videoFileInfo : this._fileManager.getFSItemFromPath(videoFileFullPath) as FileInfo;
        const videoIntegrityCheckCommand = this.makeVideoConverter(isConvertedFile); // new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand);
        const targetIntegrityCheckCommandID = getCommandID("checkvideointegrity");
        const videoIntegrityCheckCommandResult = await videoIntegrityCheckCommand.checkVideoIntegrity(fileInfo, this._jobOptions.jobID, targetIntegrityCheckCommandID, this._jobOptions.checkVideoIntegrityCommandOptions);
        if (videoIntegrityCheckCommandResult.success === false) {
            integrityCheckFailureReason = FAILURE_REASON_FAILED_TO_PERFORM_INTEGRITY_CHECK;
            this._logger.LogWarn(integrityCheckFailureReason, { fullPath: fileInfo.fullPath });
            this._outputWriter.writeLine(integrityCheckFailureReason);
        } else if (videoIntegrityCheckCommandResult.integrityCheck.isVideoGood === false) {
            integrityCheckFailureReason = isConvertedFile === true ? FAILURE_REASON_TARGET_FAILED_INTEGRITY_CHECK : FAILURE_REASON_SOURCE_FAILED_INTEGRITY_CHECK;
            this._logger.LogWarn(integrityCheckFailureReason, { videoIntegrityCheckResult: videoIntegrityCheckCommandResult });
            this._outputWriter.writeLine(`${integrityCheckFailureReason}: see logs for more details`);
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
        const success = integrityCheckFailureReason === undefined && videoIntegrityCheckCommandResult.success === true && videoIntegrityCheckCommandResult.integrityCheck.isVideoGood === true;
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
    private checkSkipVideoCodecName(videoCodecToSkip: string[], videoInfo?: VideoInfo): boolean {
        const videoStream = videoInfo?.streams.find(s => s.codec_type === "video");
        if (videoStream === undefined) {
            const msg = "video stream not found for skip video codec check";
            const err = new Error(msg);
            this._logger.LogError("unable to find video stream for file...", err, { videoInfo, videoCodecToSkip });
            this._outputWriter.writeLine(msg);
            throw err;
        }
        const normalizedVideoStreamCodec = normalizeString(videoStream.codec_name);
        const skip = videoCodecToSkip.findIndex(c => normalizeString(c) === normalizedVideoStreamCodec) !== -1;
        return skip;
    }

    private makeVideoConverter(isTarget = false): IVideoConverter {
        if (this._jobOptions.mockData?.useMockVideoConvert === true) {
            if (isTarget === true) {
                return new MockVideoConverter(this._fileManager, this._jobOptions.mockData.targetVideoInfo, this._jobOptions.mockData.targetVideoIntegrityCheck);
            } else {
                return new MockVideoConverter(this._fileManager, this._jobOptions.mockData.sourceVideoInfo, this._jobOptions.mockData.sourceVideoIntegrityCheck);
            }
        } else {
            return new FFMPEGVideoConverter(this._logger, this._fileManager, this._jobOptions.baseCommand, this._jobOptions.getInfoCommand);
        }
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
        };
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
                logger.LogVerbose("current frame found", { commandID, currentFrame: currentFrameString, numberOfFrames: totalNumberOfFrames });
                if (currentFrameString) {
                    const currentFrameNumber = parseInt(currentFrameString, 10);
                    logger.LogVerbose("current duration parsed", { currentFrameString, currentFrameNumber });
                    const progressiveUpdate = this.makeProgressiveUpdateLine(logger, commandID, currentFrameNumber, totalNumberOfFrames);
                    outputWriter.write(`${progressiveUpdate}\r`);
                }
            }
        };
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
                logger.LogVerbose("current duration found", { commandID, currentDurationString, totalDuration });
                if (currentDurationString) {
                    const currentDurationSeconds = HHMMSSmmToSeconds(currentDurationString);
                    logger.LogVerbose("current duration parsed", { currentDurationString, currentDurationSeconds });
                    const progressiveUpdate = this.makeProgressiveUpdateLine(logger, commandID, currentDurationSeconds, totalDuration);
                    outputWriter.write(`${progressiveUpdate}\r`);
                }
            }
        };
    }

    private makeProgressiveUpdateLine(logger: ILogger, commandID: string, currentValueNumber: number, totalValue: number): string {
        const pctDone = Math.floor(currentValueNumber / totalValue * 100);
        const numMarkers = Math.floor(pctDone / 5);
        logger.LogVerbose("percent done calculated", { commandID, totalValue, currentValueNumber, pctDone, numMarkers });
        const arrow = `${"=".repeat(numMarkers ?? 0)}>`.padEnd(20, " ");
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
