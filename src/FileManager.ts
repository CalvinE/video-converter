import path from 'path';
import fs from 'fs';

type BaseFSItem = {
    name: string,
    pathToItem: string,
    fullPath: string;
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

    public makeDir(targetDir: string): boolean {
        let success = false;
        const alreadyExists = fs.existsSync(targetDir);
        if (!alreadyExists) {
            fs.mkdirSync(targetDir, {
                recursive: true,
            });
            success = true;
        } else {
            const existingStats = fs.lstatSync(targetDir);
            if (!existingStats.isDirectory()) {
                throw new ErrorIsNotDirectory(targetDir);
            }
            success = true;
        }
        return success;
    }

    public enumerateDirectory(directory: string, maxRecursiveDepth = 0): FSItem[] {
        // does it exist
        const exists = fs.existsSync(directory);
        if (!exists) {
            throw new ErrorDirectoryDoesNotExist(directory);
        }
        const itemInfo: FSItem = this.getFSItemFromPath(directory);
        // is it a directory
        if (itemInfo.type !== 'directory') {
            throw new ErrorIsNotDirectory(directory);
        }
        // get directory contents
        const contents = fs.readdirSync(directory);
        // if recursive loop over stuff and go in directories
        for (const item of contents) {
            const itemPath: string = path.join(itemInfo.fullPath, item)
            const fsItem = this.getFSItemFromPath(itemPath);
            // This feels weird, but my thought is if you pass -1 or somthing then go recursive all the way?
            if (maxRecursiveDepth != 0) {
                if (fsItem.type === 'directory') {
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
            name: path.basename(itemPath),
            pathToItem: path.dirname(itemPath),
            fullPath: path.resolve(itemPath),
        }
        return baseFSItem;
    }
}