import { existsSync, lstatSync } from 'fs';
import { dirname, resolve } from 'path';
import { IFileManager } from './FileManager';
import { ILogger } from './Logger';
import { bytesToHumanReadableBytes, millisecondsToHHMMSS } from './PrettyPrint';
import { JobFile, Job } from './VideoConverter/models';

export interface IJobFileManager {
    updateJob(job: Job): void;
    writeJobFileData(): void;
    readJobFileData(): JobFile;
    shutdownAndFlush(): Promise<void>
}

class ErrorMissingJobFileData extends Error {
    static ErrorName = "MissingJobFileData";
    constructor(jobFilePath: string) {
        super(`job file does not exist and no initial job data was provided: ${jobFilePath}`)
    }
}

class ErrorJobFilePathIsNotAFile extends Error {
    static ErrorName = "JobFilePathIsNotAFile";
    constructor(jobFilePath: string) {
        super(`job file does not point to a file: ${jobFilePath}`)
    }
}

// TODO: make configurable?
const writeJobFileIntervalMilliseconds = 5000;

export class JobFileManager implements IJobFileManager {

    private _logger: ILogger;
    private _fileManager: IFileManager;
    private _jobFileFullPath: string;
    private _jobFileData: JobFile;
    private _writeIntervalMilliseconds: number;
    private _writeInterval: NodeJS.Timer;
    private _isDirty: boolean;
    private _hasUncommittedWrites: boolean;
    private _pretty: boolean;

    constructor(logger: ILogger, fileManager: IFileManager, jobFilePath: string, pretty = false, initialJobFileData?: JobFile) {
        this._logger = logger;
        this._fileManager = fileManager;
        this._jobFileFullPath = resolve(jobFilePath);
        this._isDirty = false;
        this._hasUncommittedWrites = false;
        this._pretty = pretty;
        if (existsSync(this._jobFileFullPath)) {
            const fileStats = lstatSync(this._jobFileFullPath);
            if (!fileStats.isFile()) {
                throw new ErrorJobFilePathIsNotAFile(this._jobFileFullPath);
            }
            this._logger.LogInfo("resuming job from file provided", { jobFilePath });
            // set is dirty to force initial read.
            this._isDirty = true;
            this._jobFileData = this.readJobFileData();
            this._logger.LogVerbose("initial job data read", { initialJobData: this._jobFileData });
        } else if (initialJobFileData !== undefined) {
            // must be a new job?
            // ensure directory for file exists
            this._logger.LogInfo("writing new job file because file provided does not exist", { jobFilePath });
            this._logger.LogVerbose("initial job data", { initialJobFileData });
            this._fileManager.makeDir(dirname(this._jobFileFullPath));
            this._jobFileData = initialJobFileData;
            // set has uncommitted writes to force initial write
            this._hasUncommittedWrites = true;
            this.writeJobFileData();
        } else {
            throw new ErrorMissingJobFileData(jobFilePath);
        }
        this._writeIntervalMilliseconds = writeJobFileIntervalMilliseconds;
        this._logger.LogDebug("write interval set", { writeIntervalMilliseconds: this._writeIntervalMilliseconds });
        this._writeInterval = setInterval(() => {
            this._logger.LogDebug("write interval activated", {});
            this.writeJobFileData();
        }, this._writeIntervalMilliseconds);
    }

    shutdownAndFlush(): Promise<void> {
        this._logger.LogInfo("shutting down job file manager", {});
        clearInterval(this._writeInterval);
        this.writeJobFileData();
        return Promise.resolve();
    }

    private updateJobFileStatistics(job: Job) {
        this._logger.LogDebug("updating job file statistics", {});
        if (job.result != undefined) {
            if (job.task === "convert") {
                this._jobFileData.totalSizeChangeBytes += job.result?.sizeDifference ?? 0;
                this._jobFileData.prettyTotalSizeChange = bytesToHumanReadableBytes(this._jobFileData.totalSizeChangeBytes);
                this._jobFileData.durationMilliseconds += job.result?.duration ?? 0;
                this._jobFileData.prettyDuration = millisecondsToHHMMSS(this._jobFileData.durationMilliseconds);
            } else if (job.task === "getinfo") {
                this._jobFileData.durationMilliseconds += job.result?.duration ?? 0;
                this._jobFileData.prettyDuration = millisecondsToHHMMSS(this._jobFileData.durationMilliseconds);
            } // FIXME: copy does not have a duration... need to fix that
        }
        if (job.state == 'completed' || job.state == 'error') {
            const failedJobIds: string[] = [];
            let completedCount = 0;
            let failedCount = 0;
            let sizeAfterProcessing = 0;
            for (const j of this._jobFileData.jobs) {
                if (j.state === "completed") {
                    completedCount++;
                    if (j.task === "convert") {
                        sizeAfterProcessing += j.result?.convertedFileSize ?? j.fileInfo.size;
                    } else {
                        sizeAfterProcessing += j.fileInfo.size;
                    }
                } else if (j.state === "error") {
                    failedJobIds.push(j.commandID);
                    failedCount++;
                    sizeAfterProcessing += j.fileInfo.size;
                } else {
                    sizeAfterProcessing += j.fileInfo.size;
                }
            }
            this._jobFileData.failedJobIDs = failedJobIds;
            this._jobFileData.numCompletedJobs = completedCount;
            this._jobFileData.numFailedJobs = failedCount;
            this._jobFileData.totalSizeAfterProcessing = sizeAfterProcessing;
            this._jobFileData.prettyTotalSizeAfterProcessing = bytesToHumanReadableBytes(this._jobFileData.totalSizeAfterProcessing);
            this._jobFileData.percentSizeChange = (1 - (this._jobFileData.totalSizeAfterProcessing / this._jobFileData.totalSizeBeforeProcessing)) * -1;
            this._jobFileData.percentDone = (completedCount / this._jobFileData.numJobs);
        }
    }

    public updateJob(job: Job): void {
        this._logger.LogInfo("updating job file data for job", { commandID: job.commandID });
        const jobIndex = this._jobFileData.jobs.findIndex((j) => j.commandID === job.commandID);
        if (jobIndex >= 0) {
            this._logger.LogVerbose("updating job", { job, jobIndex })
            this._jobFileData.jobs[jobIndex] = job;
            this.updateJobFileStatistics(job);
            this._hasUncommittedWrites = true
            this._logger.LogDebug("job index found for update", { jobIndex })
            this._logger.LogDebug("setting read and write cache to dirty", { hasUncommittedWrites: this._hasUncommittedWrites, isDirty: this._isDirty })
        } else {
            this._logger.LogWarn("received update for job not in the job file data", { job, jobFileFullPath: this._jobFileFullPath });
        }
    }

    public writeJobFileData(): void {
        if (this._hasUncommittedWrites === true) {
            this._logger.LogDebug("writing job file data from file", { jobFileFullPath: this._jobFileFullPath, hasUncommittedWrites: this._hasUncommittedWrites })
            this._fileManager.writeFile(this._jobFileFullPath, JSON.stringify(this._jobFileData, undefined, this._pretty ? 2 : 0), true);
            // this._isDirty = true;
            this._hasUncommittedWrites = false;
            this._logger.LogDebug("clearing dirty flag for write cache", { hasUncommittedWrites: this._hasUncommittedWrites })
        } else {
            this._logger.LogDebug("there are no uncommitted writes to job file so we will nor write the data to disk...", { hasUncommittedWrites: this._hasUncommittedWrites, isDirty: this._isDirty })
        }
    }

    public readJobFileData(): JobFile {
        if (this._isDirty === true) {
            this._logger.LogDebug("reading job file data from file", { jobFileFullPath: this._jobFileFullPath })
            const rawData = this._fileManager.readFile(this._jobFileFullPath)
            this._jobFileData = JSON.parse(rawData);
            this._isDirty = false;
            this._logger.LogDebug("clearing dirty flag for read cache", { isDirty: this._isDirty })
        } else {
            this._logger.LogDebug("cached data is clean, so returning cache", { isDirty: this._isDirty });
        }
        return this._jobFileData;
    }

}