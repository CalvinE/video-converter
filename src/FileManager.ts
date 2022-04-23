import { ILogger } from './Logger/Logger';
import path from 'path';
import fs from 'fs';

type BaseFSItem = {
    fullPath: string;
    name: string;
    pathToItem: string;
    relativepath: string;
}

export type FileInfo = BaseFSItem & {
    type: "file";
    size: number;
    extension: string;
}

export type DirectoryInfo = BaseFSItem & {
    type: "directory";
    files: FSItem[];
}

export type FSItem = FileInfo | DirectoryInfo;

export interface IFileManager {
    /**
     * @description Get a list of files and folders in a provided directory.
     * @param directory string The directory who contents we want to enumerate.
     * @param maxRecursiveDepth number? If 0 or less no recursion is used. Otherwise the function will recurse up to the value provided times.
     */
    enumerateDirectory: (directory: string, maxRecursiveDepth?: number) => FSItem[]
    /**
     * @description Will create a directory (recursivly if necessary).
     * @param targetDir string The path to create a directory.
     * @returns boolean value. if true then the directory was created or already existed.
     */
    makeDir: (targetDir: string) => boolean
}

class ErrorDirectoryDoesNotExist extends Error {
    static ErrorName = "DirectoryDoesNotExist";
    constructor(directory: string) {
        super(`directory does not exist: ${directory}`)
    }
}

class ErrorIsNotDirectory extends Error {
    static ErrorName = "IsNotDirectory";
    constructor(item: string) {
        super(`item exists and is not a directory: ${item}`)
    }
}

export class FileManager implements IFileManager {
    private _logger: ILogger;

    constructor(logger: ILogger) {
        this._logger = logger;
    }

    public makeDir(targetDir: string): boolean {
        let success = false;
        const alreadyExists = fs.existsSync(targetDir);
        if (!alreadyExists) {
            this._logger.LogVerbose("directory did not already exist, so we are creating it", {targetDir});
            fs.mkdirSync(targetDir, {
                recursive: true,
            });
            success = true;
        } else {
            const existingStats = fs.lstatSync(targetDir);
            if (!existingStats.isDirectory()) {
                const err =  new ErrorIsNotDirectory(targetDir);
                this._logger.LogError("targetDir provided is not a directory...", err, {targetDir})
                throw err;
            }
            success = true;
        }
        return success;
    }

    public enumerateDirectory(directory: string, maxRecursiveDepth = 0): FSItem[] {
        // does it exist
        this._logger.LogDebug("attempting to enumerate directory", {directory, maxRecursiveDepth});
        const exists = fs.existsSync(directory);
        if (!exists) {
            const err = new ErrorDirectoryDoesNotExist(directory);
            this._logger.LogError("directory does not exist", err, {directory});
            throw err;
        }
        const itemInfo: FSItem = this.getFSItemFromPath(directory);
        // is it a directory
        if (itemInfo.type !== 'directory') {
            const err = new ErrorIsNotDirectory(directory);
            this._logger.LogError("directory to enumerate is not a directory", err, {directory});
            throw err;
        }
        // get directory contents
        const contents = fs.readdirSync(directory);
        this._logger.LogDebug("found contents of directory", {directory, numItems: contents.length, maxRecursiveDepth});
        // if recursive loop over stuff and go in directories
        for (const item of contents) {
            const itemPath: string = path.join(itemInfo.fullPath, item)
            this._logger.LogVerbose("getting info on specific item", {file: item});
            const fsItem = this.getFSItemFromPath(itemPath);
            this._logger.LogVerbose("file info aquired", {fsItem})
            // This feels weird, but my thought is if you pass -1 or somthing then go recursive all the way?
            if (maxRecursiveDepth != 0) {
                if (fsItem.type === 'directory') {
                    this._logger.LogVerbose("recursing into directory", {fsItem, maxRecursiveDepth});
                    const subContents = this.enumerateDirectory(itemPath, maxRecursiveDepth-1);
                    fsItem.files = subContents;
                }
            }
            itemInfo.files.push(fsItem);
        }
        return itemInfo.files;
    }

    private getFSItemFromPath(itemPath: string): FSItem {
        const stats = fs.lstatSync(itemPath);
        const baseFSInfo = this.getBaseFSInfoFromPath(itemPath);
        if (stats.isDirectory()) {
            return {
                ...baseFSInfo,
                type: 'directory',
                files: [],
            }
        } else {
            return {
                ...baseFSInfo,
                type: 'file',
                size: stats.size,
                extension: path.extname(itemPath).toLowerCase(),
            }
        }
    }

    private getBaseFSInfoFromPath(itemPath: string): BaseFSItem {
        const baseFSItem: BaseFSItem = {
            fullPath: path.resolve(itemPath),
            name: path.basename(itemPath),
            pathToItem: path.dirname(itemPath),
            relativepath: path.dirname(path.relative(".", itemPath)),
        }
        return baseFSItem;
    }
}