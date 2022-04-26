import { NoopLogger } from './../Logger/NoopLogger';
import { ILogger } from './../Logger/Logger';
import { join } from 'path';
import { FileManager, IFileManager } from '../FileManager';
import { assert } from 'chai';
import { rmSync } from 'fs';

const testFolderPath = join(__dirname, "test_dir");

const mkdirTestFolder = join(testFolderPath, "a_temp_dir");

describe('FileManager tests', () => {
    describe('enumerateDirectory', () => {
        let logger: ILogger;
        let fileManager: IFileManager
        before(() => {
            logger = new NoopLogger('debug');
            fileManager = new FileManager(logger);
        });
        it('Should enumerate a directory at a single level when max recursion level is 0 or less', () => {
            const dirContents = fileManager.enumerateDirectory(testFolderPath)
            assert.equal(dirContents.length, 2)
        });
        it('Should populate file extension on FIleInfo.', () => {
            const dirContents = fileManager.enumerateDirectory(testFolderPath)
            assert.equal(dirContents.length, 2)
            if (dirContents[1].type === 'file') {
                assert.equal(dirContents[1].extension, ".txt");
            } else {
                assert.isTrue(false, "first item in dirContents should be a file with a .txt extension")
            }
        });
        it('Should enumerate a directory recursivly when max recursion level is 1 or greater', () => {
            const dirContents = fileManager.enumerateDirectory(testFolderPath, 99)
            assert.equal(dirContents.length, 2)
            if (dirContents[0].type === 'directory') {
                assert.equal(dirContents[0].files.length, 1)
            } else {
                assert.isTrue(false, "first item in dirContents should be folder with contents")
            }
        });
    });
    describe('makeDir', () => {
        let logger: ILogger;
        let fileManager: IFileManager
        before(() => {
            logger = new NoopLogger('debug');
            fileManager = new FileManager(logger);
        });
        after(() => {
            rmSync(mkdirTestFolder, {
                recursive: true,
            })
        });
        it('Should create a directory where asked', () => {
            const success = fileManager.makeDir(mkdirTestFolder)
            assert.isTrue(success);
        });
    });
});