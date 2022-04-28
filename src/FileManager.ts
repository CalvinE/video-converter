import { ILogger } from './Logger/Logger';
import { basename, dirname, extname, join, relative, resolve } from 'path';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';

type BaseFSItem = {
    fullPath: string;
    name: string;
    pathToItem: string;
    relativePath: string;
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
     * @description Will create a directory (recursively if necessary).
     * @param targetDir string The path to create a directory.
     * @returns boolean value. if true then the directory was created or already existed.
     */
    makeDir: (targetDir: string) => boolean

    getFSItemFromPath: (itemPath: string) => FSItem

    // TODO: need to make a proper result for the return value.
    copyFile: (sourceFileFullPath: string, targetPath: string) => boolean;

    readFile: (sourceFilePath: string) => string;

    writeFile: (targetFileFullPath: string, content: string, truncate: boolean) => void;

    safeUnlinkFile: (targetFileFullPath: string) => void;

    unlinkFile: (targetFileFullPath: string) => void;

    exists: (path: string) => boolean;
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

class ErrorIsNotFile extends Error {
    static ErrorName = "IsNotFile";
    constructor(item: string) {
        super(`item exists and is not a file: ${item}`)
    }
}

class ErrorItemDoesNotExist extends Error {
    static ErrorName = "ItemDoesNotExist";
    constructor(item: string) {
        super(`item does not exist: ${item}`)
    }
}

export class FileManager implements IFileManager {
    private _logger: ILogger;

    constructor(logger: ILogger) {
        this._logger = logger;
    }

    public exists(path: string): boolean {
        return existsSync(path);
    }

    public unlinkFile(targetFileFullPath: string) {
        unlinkSync(targetFileFullPath)
    }

    public safeUnlinkFile(targetFileFullPath: string) {
        try {
            this.unlinkFile(targetFileFullPath)
        } catch (error) {
            this._logger.LogWarn("unable to unlink file", { error })
        }
    }

    public writeFile(targetFilePath: string, content: string, truncate: boolean): void {
        const targetFileFullPath = resolve(targetFilePath);
        const targetFileParentDirectory = dirname(targetFileFullPath);
        if (!this.exists(targetFileParentDirectory)) {
            this.makeDir(targetFileParentDirectory);
        }
        writeFileSync(targetFileFullPath, content, {
            encoding: "utf8",
            flag: truncate === true ? "w" : "a",
        });
    }

    public readFile(sourceFilePath: string): string {
        if (!this.exists(sourceFilePath)) {
            throw new ErrorItemDoesNotExist(sourceFilePath);
        }
        const fileStats = lstatSync(sourceFilePath);
        if (!fileStats.isFile()) {
            throw new ErrorIsNotFile(sourceFilePath);
        }
        const content = readFileSync(sourceFilePath, {
            encoding: "utf8",
        });
        return content;
    }

    public copyFile(sourceFileFullPath: string, targetFileFullPath: string): boolean {
        if (!this.exists(sourceFileFullPath)) {
            throw new ErrorItemDoesNotExist(sourceFileFullPath);
        }
        const stats = lstatSync(sourceFileFullPath);
        if (stats.isDirectory()) {
            throw new ErrorIsNotFile(sourceFileFullPath);
        }
        const targetFileParentDir = dirname(targetFileFullPath);
        if (!this.exists(targetFileParentDir)) {
            const wasMade = this.makeDir(targetFileParentDir);
            if (!wasMade) {
                throw new ErrorDirectoryDoesNotExist(targetFileParentDir);
            }
        }
        copyFileSync(sourceFileFullPath, targetFileFullPath);
        return true; //???
    }


    public makeDir(targetDir: string): boolean {
        let success = false;
        const alreadyExists = this.exists(targetDir);
        if (!alreadyExists) {
            this._logger.LogVerbose("directory did not already exist, so we are creating it", { targetDir });
            mkdirSync(targetDir, {
                recursive: true,
            });
            success = true;
        } else {
            const existingStats = lstatSync(targetDir);
            if (!existingStats.isDirectory()) {
                const err = new ErrorIsNotDirectory(targetDir);
                this._logger.LogError("targetDir provided is not a directory...", err, { targetDir })
                throw err;
            }
            success = true;
        }
        return success;
    }

    public enumerateDirectory(directory: string, maxRecursiveDepth = 0, originalDirectory?: string): FSItem[] {
        // does it exist
        this._logger.LogDebug("attempting to enumerate directory", { directory, maxRecursiveDepth });
        const exists = this.exists(directory);
        if (!exists) {
            const err = new ErrorDirectoryDoesNotExist(directory);
            this._logger.LogError("directory does not exist", err, { directory });
            throw err;
        }
        const itemInfo: FSItem = this.getFSItemFromPath(directory, originalDirectory ?? directory);
        // is it a directory
        if (itemInfo.type !== 'directory') {
            const err = new ErrorIsNotDirectory(directory);
            this._logger.LogError("directory to enumerate is not a directory", err, { directory });
            throw err;
        }
        // get directory contents
        const contents = readdirSync(directory);
        this._logger.LogDebug("found contents of directory", { directory, numItems: contents.length, maxRecursiveDepth });
        // if recursive loop over stuff and go in directories
        for (const item of contents) {
            const itemPath: string = join(itemInfo.fullPath, item)
            this._logger.LogVerbose("getting info on specific item", { file: item });
            const fsItem = this.getFSItemFromPath(itemPath, originalDirectory ?? directory);
            this._logger.LogVerbose("file info acquired", { fsItem })
            // This feels weird, but my thought is if you pass -1 or something then go recursive all the way?
            if (maxRecursiveDepth != 0) {
                if (fsItem.type === 'directory') {
                    this._logger.LogVerbose("recursing into directory", { fsItem, maxRecursiveDepth });
                    const subContents = this.enumerateDirectory(itemPath, maxRecursiveDepth - 1, originalDirectory ?? directory);
                    fsItem.files = subContents;
                }
            }
            itemInfo.files.push(fsItem);
        }
        return itemInfo.files;
    }

    public getFSItemFromPath(itemPath: string, basePath = "."): FSItem {
        const stats = lstatSync(itemPath);
        const baseFSInfo = this.getBaseFSInfoFromPath(itemPath, basePath);
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
                extension: extname(itemPath).toLowerCase(),
            }
        }
    }

    private getBaseFSInfoFromPath(itemPath: string, basePath: string): BaseFSItem {
        const baseFSItem: BaseFSItem = {
            fullPath: resolve(itemPath),
            name: basename(itemPath),
            pathToItem: dirname(itemPath),
            relativePath: dirname(relative(basePath, itemPath)),
        }
        return baseFSItem;
    }
}