import { AppOptions } from './../OptionsParser';
import { IRunner } from './IRunner';
import { IFileManager } from '../FileManager/FileManager';
import { IOutputWriter } from './../OutputWriter';
import { ILogger } from './../Logger';
import { basename, extname, resolve } from 'path';
import { IJobFileManager, JobFileManager } from '../JobFileManager';
import { CheckVideoIntegrityJobResult, ConvertVideoJobResult, CopyJobResult, getJobFileID, GetVideoInfoJobResult, INVALID, JobFile, SubCommand } from '../VideoConverter';
import { bytesToHumanReadableBytes, millisecondsToHHMMSS } from '../PrettyPrint';
import { JobFactory } from '../Jobs/JobFactory';
import { getAllJobs } from './util';

const WRITE_PRETTY_JOB_FILE = true;

export class StandAloneRunner implements IRunner {
    private _logger: ILogger;
    private _outputWriter: IOutputWriter;
    private _appOptions: AppOptions;
    private _fileManager: IFileManager;

    constructor(logger: ILogger, outputWriter: IOutputWriter, appOptions: AppOptions, fileManager: IFileManager) {
        this._logger = logger;
        this._outputWriter = outputWriter;
        this._appOptions = appOptions;
        this._fileManager = fileManager;
    }

    public async run(): Promise<void> {
        const jobFileFullPath = resolve(this._appOptions.jobFile);
        try {
            let jobFileManager: IJobFileManager;
            if (this._fileManager.exists(jobFileFullPath)) {
                // we are reading from a job file, so no need to parse other args and create jobs,
                this._logger.LogInfo("reading job data from file", { targetJobFile: jobFileFullPath });
                this._outputWriter.writeLine(`reading job data from ${jobFileFullPath}`);
                const jobFileData = this._fileManager.readFile(jobFileFullPath);
                const initialJobsFileData: JobFile = JSON.parse(jobFileData);
                jobFileManager = new JobFileManager(this._logger, this._fileManager, jobFileFullPath, WRITE_PRETTY_JOB_FILE, initialJobsFileData);
            } else {
                // we need to make the jobs based on this._appOptions
                this._logger.LogInfo("writing new job file because job file value does not exist in fs", { jobFile: jobFileFullPath });
                this._outputWriter.writeLine(`writing job file to ${jobFileFullPath}`);
                let subCommand: SubCommand = INVALID;
                if (this._appOptions.convertVideo === true) {
                    this._logger.LogDebug("convert flag found", {});
                    subCommand = "convert";
                } else if (this._appOptions.getInfo === true) {
                    this._logger.LogDebug("getInfo flag found", {});
                    subCommand = "getinfo";
                } else if (this._appOptions.checkVideoIntegrity === true) {
                    this._logger.LogDebug("checkVideoIntegrity flag found", {});
                    subCommand = "checkvideointegrity";
                }
                this._logger.LogInfo("enumerating source path", { sourcePath: this._appOptions.sourcePath });
                this._outputWriter.writeLine(`enumerating directory: ${this._appOptions.sourcePath}`);
                const sourcePathContents = await this._fileManager.enumerateDirectory(this._appOptions.sourcePath, 10);
                const jobs = getAllJobs(this._logger, subCommand, sourcePathContents, this._appOptions);
                const preRunSize = jobs.reduce((a, j) => j.sourceFileInfo.size + a, 0);
                const jobFileName = basename(jobFileFullPath);
                const jobName = jobFileName.replace(extname(jobFileName), "");
                jobFileManager = new JobFileManager(this._logger, this._fileManager, jobFileFullPath, WRITE_PRETTY_JOB_FILE, {
                    // The order of these fields is important.
                    // The order here is the order they will appear in the file.
                    // So ordering these well will make it easier to read in a text editor.
                    jobFileID: getJobFileID(),
                    jobName: jobName,
                    percentDone: 0,
                    percentSizeChange: 0,
                    totalSizeChangeBytes: 0,
                    prettyTotalSizeChange: bytesToHumanReadableBytes(0),
                    durationMilliseconds: 0,
                    prettyDuration: millisecondsToHHMMSS(0),
                    totalSizeBeforeProcessing: preRunSize,
                    prettyTotalSizeBeforeProcessing: bytesToHumanReadableBytes(preRunSize),
                    totalSizeAfterProcessing: 0,
                    prettyTotalSizeAfterProcessing: bytesToHumanReadableBytes(0),
                    numCompletedJobs: 0,
                    numFailedJobs: 0,
                    failedJobIDs: [],
                    numJobs: jobs.length,
                    options: this._appOptions,
                    jobs,
                });
            }
            const jobFileData = jobFileManager.readJobFileData();
            if (this._appOptions.saveJobFileOnly === true) {
                this._logger.LogVerbose("job file data", { jobFileFullPath, jobFileData });
                this._logger.LogInfo("exiting because saveJobFile flag is present.", { savedJobFileOnly: this._appOptions.saveJobFileOnly });
                this._outputWriter.writeLine(`saving job file (${jobFileData.jobs.length} jobs) jobs to ${jobFileFullPath}`);
                return;
            }
            // handle Ctrl+C make sure to flush job file.
            process.on("SIGINT", async () => {
                await jobFileManager.shutdownAndFlush();
                throw new Error("SIGINT received, terminating application...");
            });
            this._logger.LogVerbose("processing jobs due to lack of saveJobFileOnly flag", { savedJobFileOnly: this._appOptions.saveJobFileOnly });
            this._logger.LogVerbose("about to restore app options from job file", { oldAppOptions: this._appOptions });
            this._appOptions = jobFileData.options;
            this._logger.LogInfo("restoring app options from job file", { ppOptions: this._appOptions });
            this._logger.LogInfo("jobs loaded", { numJobs: jobFileData.jobs.length });
            this._logger.LogVerbose("listing all jobs data", { jobFileData });
            this._outputWriter.writeLine(`found ${jobFileData.jobs?.length} jobs based on parameters`);
            let totalSizeChange = 0;
            const startTimeMilliseconds = Date.now();
            const numJobs = jobFileData.jobs.length;
            let successfulJobs = 0;
            let failedJobs = 0; let i = 0;
            for (const jobOptions of jobFileData.jobs) {
                i++;
                this._logger.LogInfo("starting job", { jobID: jobOptions.jobID });
                this._outputWriter.writeLine("");
                this._outputWriter.writeLine(`starting job ${i} of ${numJobs} ${jobOptions.jobID} - ${jobOptions.task}`);
                const job = JobFactory.makeJob(this._logger, this._outputWriter, this._fileManager, jobOptions);
                if (jobOptions.state === "running" || jobOptions.state === "error") {
                    // a job was started, so we need to clean up the what files may have been created
                    this._logger.LogInfo(`job was interrupted or encountered an error attempting to restart job`, { job: jobOptions });
                    this._outputWriter.writeLine(`job was interrupted or encountered an error attempting to restart job`);
                    // handleJobFailureCleanup(this._logger, this._outputWriter, jobOptions);
                    job.handleJobFailureCleanup();
                    jobOptions.state = "pending";
                    jobFileManager.updateJob(jobOptions);
                } else if (jobOptions.state === "completed") {
                    // skip the job its already done...
                    this._logger.LogInfo("job is already completed... skipping...", { jobID: jobOptions.jobID, task: jobOptions.task, sourceFile: jobOptions.sourceFileInfo.fullPath });
                    this._logger.LogVerbose("previously completed job data", { job: jobOptions });
                    this._outputWriter.writeLine(`previously completed job ${jobOptions.jobID}... see logs for details.`);
                    continue;
                }
                // pending is the only other state?
                this._outputWriter.writeLine(`running job`);
                this._logger.LogDebug("job options", { job: jobOptions });
                let success = false;
                let durationMilliseconds = 0;
                let sizeBytesChange = 0;
                let sourceFile = "";
                let targetFile = "";
                try {
                    jobOptions.state = "running";
                    jobFileManager.updateJob(jobOptions);
                    const result = await job.execute();
                    if (jobOptions.task === "convert") {
                        jobOptions.result = result as ConvertVideoJobResult;
                        durationMilliseconds = result.durationMilliseconds;
                        totalSizeChange += jobOptions.result.sizeDifference;
                        sizeBytesChange = jobOptions.result.sizeDifference;
                        sourceFile = jobOptions.result.sourceFileInfo.fullPath;
                        targetFile = jobOptions.result.targetFileInfo?.fullPath ?? "";
                        success = result.success;
                    } else if (jobOptions.task === "getinfo") {
                        jobOptions.result = result as GetVideoInfoJobResult;
                        durationMilliseconds = result.durationMilliseconds;
                        sourceFile = jobOptions.result.fileInfo?.fullPath ?? "";
                        success = result.success;
                    } else if (jobOptions.task === "copy") {
                        jobOptions.result = result as CopyJobResult;
                        durationMilliseconds = result.durationMilliseconds;
                        sourceFile = jobOptions.result.sourceFileInfo.fullPath;
                        targetFile = jobOptions.result.targetFileInfo?.fullPath ?? "";
                        success = result.success;
                    } else if (jobOptions.task === "checkvideointegrity") {
                        jobOptions.result = result as CheckVideoIntegrityJobResult;
                        durationMilliseconds = result.durationMilliseconds;
                        sourceFile = jobOptions.result?.fileInfo?.fullPath ?? "";
                        success = result.success;
                    }
                    else {
                        /// We should not be allowed to get here...
                        this._logger.LogWarn("job with invalid task encountered...", jobOptions);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (jobOptions as any).state = "error";
                    }
                    if (success !== true) {
                        jobOptions.state = "error";
                        failedJobs++;
                        this._logger.LogWarn("job failed", {
                            job: jobOptions
                        });
                        this._outputWriter.writeLine(`job failed: ${jobOptions.jobID}`);
                        this._outputWriter.writeLine(`reason: ${jobOptions.failureReason} - see logs for more details`);
                        this._outputWriter.writeLine(`run time: ${millisecondsToHHMMSS(durationMilliseconds)}`);
                    } else {
                        successfulJobs++;
                        jobOptions.state = "completed";
                        this._logger.LogInfo("job successful", { job: jobOptions });
                        this._outputWriter.writeLine(`job finished: ${jobOptions.jobID}`);
                        this._outputWriter.writeLine(`run time: ${millisecondsToHHMMSS(durationMilliseconds)}`);
                        if (sizeBytesChange !== 0) {
                            this._outputWriter.writeLine(`file size changed by ${bytesToHumanReadableBytes(sizeBytesChange)}`);
                        }
                        if (sourceFile !== "") {
                            this._outputWriter.writeLine(`source => ${sourceFile}`);
                            if (targetFile !== "") {
                                this._outputWriter.writeLine(`target => ${targetFile}`);
                            }
                        }
                    }
                } catch (err) {
                    failedJobs++;
                    jobOptions.state = "error";
                    jobOptions.failureReason = `${err}`;
                    this._logger.LogError("job processing failed", err as Error, { job: jobOptions });
                    this._outputWriter.writeLine(`an error occurred while processing job ${jobOptions.jobID}`);
                    this._outputWriter.writeLine(`error: ${jobOptions.failureReason}`);
                    // handleJobFailureCleanup(this._logger, this._outputWriter, jobOptions);

                } finally {
                    jobFileManager.updateJob(jobOptions);
                }
            }
            // add a line to make it easier to read.
            const endTimeMilliseconds = Date.now();
            const durationMilliseconds = endTimeMilliseconds - startTimeMilliseconds;
            const prettyDuration = millisecondsToHHMMSS(durationMilliseconds);
            const prettyTotalSizeReduction = bytesToHumanReadableBytes(totalSizeChange);
            const totalJobs = jobFileData.jobs.length;
            this._outputWriter.writeLine("");
            this._logger.LogInfo("all jobs finished", { prettyDuration, durationMilliseconds, prettyTotalSizeReduction, totalSizeReduction: totalSizeChange, successfulJobs, failedJobs, totalJobs });
            this._outputWriter.writeLine(`All jobs finished`);
            this._outputWriter.writeLine(`Run time: ${prettyDuration}`);
            this._outputWriter.writeLine(`Total Size Reduction: ${prettyTotalSizeReduction}`);
            this._outputWriter.writeLine(`Jobs Successful: ${successfulJobs}`);
            this._outputWriter.writeLine(`Jobs Failed: ${failedJobs}`);
            this._outputWriter.writeLine(`Total number of jobs: ${totalJobs}`);
            await jobFileManager.shutdownAndFlush();

        } catch (err: unknown) {
            this._logger.LogError("app encountered fatal error!", err as Error, {});
            this._outputWriter.writeLine("app encountered fatal error, please see the logs");
        } finally {
            this._logger.LogInfo("The job file for this run was saved", { jobFile: jobFileFullPath });
            this._outputWriter.writeLine(`log and job file are located at: ${resolve(this._appOptions.metadataPath)}`);
            this._outputWriter.writeLine(`The job file for this run is located at: ${jobFileFullPath}`);
            await this._outputWriter.shutdown();
            await this._logger.shutdown();
        }
    }
}