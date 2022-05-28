import { FileInfo, FSItem } from "../FileManager/FileManager";
import { JobFactory } from "../Jobs/JobFactory";
import { ILogger } from "../Logger";
import { AppOptions } from "../OptionsParser";
import { JobsOptionsArray, SubCommand, Task } from "../VideoConverter";

function doesFileMatchCriteria(logger: ILogger, item: FileInfo, task: Task, allowedFileExtensions: string[], fileNameRegex?: RegExp): boolean {
    if (fileNameRegex !== undefined) {
        if (fileNameRegex.test(item.name)) {
            logger.LogDebug("adding file for processing because it matched the regex", {
                targetFileNameRegex: fileNameRegex.source,
                file: item,
                task,
            });
            return true;
        } else {
            logger.LogInfo("skipping file because regex did not match name", {
                targetFileNameRegex: fileNameRegex,
                file: item,
                task
            });
            return false;
        }
    } else if (allowedFileExtensions.indexOf(item.extension) >= 0) {
        logger.LogDebug("file selected because extension matched allowed file extensions", {
            allowedFileExtensions,
            file: item,
            task,
        });
        return true;
    }
    return false;
}



export function getAllJobs(logger: ILogger, subCommand: SubCommand, items: FSItem[], options: AppOptions): JobsOptionsArray {
    logger.LogDebug("getting all files based on parameters", { targetFileNameRegex: options.targetFileNameRegex, allowedFileExtensions: options.allowedFileExtensions });
    // TODO: Remember what I was thinking here... Is it that if we are saving in place we should not need to copy anything?
    const allowCopy = !options.saveInPlace;
    const jobOptions: JobsOptionsArray = [];
    let targetFileNameRegex: RegExp | undefined;
    if (options.targetFileNameRegex !== undefined) {
        targetFileNameRegex = new RegExp(options.targetFileNameRegex, "i");
    }
    let copyFileNameRegex: RegExp | undefined;
    if (options.fileCopyRegex !== undefined) {
        copyFileNameRegex = new RegExp(options.fileCopyRegex, "i");
    }
    for (const item of items) {
        if (item.type === "file") {
            if (doesFileMatchCriteria(logger, item, subCommand, options.allowedFileExtensions, targetFileNameRegex)) {
                jobOptions.push(JobFactory.makeJobOptions(logger, subCommand, item, options));
            }
            else if (allowCopy && doesFileMatchCriteria(logger, item, "copy", options.fileCopyExtensions, copyFileNameRegex)) {
                // is file one we should copy?
                logger.LogInfo("copy job created", {
                    fileInfo: item,
                });
                jobOptions.push(JobFactory.makeJobOptions(logger, "copy", item, options));
            } else {
                logger.LogDebug("file name does not match the selection criteria", { fileName: item.name });
            }
        } else if (item.type === 'directory') {
            const subItems: JobsOptionsArray = getAllJobs(logger, subCommand, item.files, options);
            jobOptions.push(...subItems);
        }
    }
    return jobOptions;
}