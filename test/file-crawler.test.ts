import { join } from 'path';
import { FileCrawler, IFileCrawler } from '../src/file-crawler';
import {  } from 'chai';

const testFolderPath = join(__dirname, "test_dir");
const testFilePath = join(__dirname, "test_dir", "test.txt");

describe('file-crawlghirken tester', () => {
    describe('enumerateDirectory', () => {
        let fileCrawler: IFileCrawler
        before(() => {
            fileCrawler = new FileCrawler();
        });
        it('Should enumerate a directory', () => {
            const dirContents = fileCrawler.enumerateDirectory(testFolderPath)
        });
        it('Should enumerate a directory recursivly when recursive is true', () => {
            const dirContents = fileCrawler.enumerateDirectory(testFolderPath, 1)
        });
    });
});