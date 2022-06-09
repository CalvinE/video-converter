import { extname, join } from 'path';
import { FSItem, FileInfo, IFileManager, getBaseFSInfoFromPath } from './FileManager';

/**
 * The idea with this mock file manager initially is to aid in the testing of the ConvertVideoJob.
 * Eventually it may need to be reworked if testing other things becomes a priority...
 * the _contents private member will be an array of FileInfo, we dont care as much about directories...?
 */
export class MockFileManager implements IFileManager {
    private _contents: FileInfo[];
    constructor(contents: FileInfo[]) {
        this._contents = contents;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    enumerateDirectory(_directory: string, _maxRecursiveDepth?: number | undefined): FSItem[] {
        // This is weird but I am overloading this to get the number of files in the _contents array.
        return this._contents;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    makeDir(_targetDir: string): boolean {
        return true;
    }
    getFSItemFromPath(itemPath: string, basePath = "."): FSItem {
        const fileInfo: FSItem = {
            ...getBaseFSInfoFromPath(itemPath, basePath),
            type: 'file',
            size: Math.floor(Math.random() * 100000),
            extension: extname(itemPath).toLowerCase(),
        }
        return fileInfo;
    }
    copyFile(sourceFileFullPath: string, targetPath: string): boolean {
        throw new Error("not implements");
    }
    readFile(sourceFilePath: string): string {
        throw new Error("not implements");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    writeFile(targetFileFullPath: string, content: string, _truncate: boolean): void {
        const baseFSItem = getBaseFSInfoFromPath(targetFileFullPath, ".");
        const newFile: FileInfo = {
            ...baseFSItem,
            type: "file",
            size: content?.length ?? 0,
            extension: extname(targetFileFullPath),
        }
        this._contents.push(newFile);
    }
    safeUnlinkFile(targetFileFullPath: string): boolean {
        return this.unlinkFile(targetFileFullPath);
    }
    unlinkFile(targetFileFullPath: string): boolean {
        const fileIndex = this._contents.findIndex(f => f.fullPath === targetFileFullPath);
        if (fileIndex === -1) {
            return false;
        }
        this._contents.splice(fileIndex, 1);
        return true;
    }
    renameFile(sourceFileFullPath: string, targetFileFullPath: string): void {
        const oldIndex = this._contents.findIndex(f => f.fullPath === sourceFileFullPath);
        if (oldIndex === -1) {
            throw new Error("source file for rename does not exist.")
        }
        const oldFile: FileInfo = {
            ...this._contents[oldIndex],
            ...getBaseFSInfoFromPath(targetFileFullPath, "."),
        }
        this._contents.splice(oldIndex, 1);
        const newIndex = this._contents.findIndex(f => f.fullPath === targetFileFullPath);
        if (newIndex === -1) {
            // otherwise we just push the new item on the array...
            this._contents.push(oldFile);
        } else {
            // if file exists we need to overwrite it...
            this._contents[newIndex] = oldFile;
        }
    }
    safeRenameFile(sourceFileFullPath: string, targetFileFullPath: string): boolean {
        try {
            this.renameFile(sourceFileFullPath, targetFileFullPath);
            return true;
        } catch (err) {
            return false;
        }
    }
    exists(path: string): boolean {
        const exists = this._contents.findIndex(f => f.fullPath === path)
        return exists !== -1;
    }
    joinPath(...pathParts: string[]): string {
        return join(...pathParts)
    }
}