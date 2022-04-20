import path from 'path';
import fs from 'fs';
import { dir } from 'console';

type BaseFSItem = {
    name: string,
    pathToItem: string,
    fullPath: string;
}

export type FileInfo = BaseFSItem & {
    type: "file";
    size: number;
}

export type DirectoryInfo = BaseFSItem & {
    type: "directory";
    files: FSItem[];
}

export type FSItem = FileInfo | DirectoryInfo;

export interface IFileCrawler {
    /**
     * 
     */
    enumerateDirectory: (directory: string, maxRecursiveDepth?: number) => FSItem[]
}

class ErrorDirectoryDoesNotExist extends Error {
    static ErrorName: string = "DirectoryDoesNotExist";
    constructor(directory: string) {
        super(`directory does not exist: ${directory}`)
    }
}

class ErrorIsNotDirectory extends Error {
    static ErrorName: string = "IsNotDirectory";
    constructor(item: string) {
        super(`item is not a directory: ${item}`)
    }
}

export class FileCrawler implements IFileCrawler {

    public enumerateDirectory(directory: string, maxRecursiveDepth: number = 0): FSItem[] {
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
            const fsItem = this.getFSItemFromPath(item);
            // This feels weird, but my thought is if you pass -1 or somthing then go recursive all the way?
            if (maxRecursiveDepth != 0) {
                if (fsItem.type === 'directory') {
                     const subContents = this.enumerateDirectory(item, maxRecursiveDepth-1);
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