import { join } from 'path';
import { FileManager, IFileManager } from '../src/FileManager';
import { assert } from 'chai';
import { rmSync } from 'fs';

const testFolderPath = join(__dirname, "test_dir");

const mkdirTestFolder = join(testFolderPath, "a_temp_dir");

describe('FileManager tests', () => {
    describe('enumerateDirectory', () => {
        let fileCrawler: IFileManager
        before(() => {
            fileCrawler = new FileManager();
        });
        it('Should enumerate a directory at a single level when max recursion level is 0 or less', () => {
            const dirContents = fileCrawler.enumerateDirectory(testFolderPath)
            assert.equal(dirContents.length, 2)
        });
        it('Should enumerate a directory recursivly when max recursion level is 1 or greater', () => {
            const dirContents = fileCrawler.enumerateDirectory(testFolderPath, 99)            
            assert.equal(dirContents.length, 2)
            if (dirContents[0].type === 'directory') {
                assert.equal(dirContents[0].files.length, 1)
            } else {
                assert.isTrue(false, "first item in dirContents should be folder with contents")
            }
        });
    });
    describe('makeDir', () => {
        let fileCrawler: IFileManager
        before(() => {
            fileCrawler = new FileManager();
        });
        after(() => {
            rmSync(mkdirTestFolder, {
                recursive: true,
            })
        });
        it('Should create a directory where asked', () => {
            const success = fileCrawler.makeDir(mkdirTestFolder)
            assert.isTrue(success);
        },);
    });
});