import { ConvertJobOptions } from './../../VideoConverter/models';
import { FileInfo } from '../../FileManager/FileManager';
import { defaultAppOptions } from '../../OptionsParser';
import { JobFactory, SourceTargetCollisionError, TEMP_FILE_PREFIX } from './../../Jobs/JobFactory';
import { ILogger } from './../../Logger/Logger';
import { NoopLogger } from './../../Logger/NoopLogger';
import { assert } from 'chai';
import { CONVERT_VIDEO_JOB_NAME } from '../../Jobs/ConvertVideoJob';
import { join } from 'path';
describe('JobFactory', () => {
    let logger: ILogger;
    let sourceFileInfo: FileInfo;
    let tempTargetFileFullPath: string;
    before(() => {
        logger = new NoopLogger("debug");
        sourceFileInfo = {
            "fullPath": "X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1\\Alfred.Hitchcock.Presents.S01E01.avi",
            "name": "Alfred.Hitchcock.Presents.S01E01.avi",
            "pathToItem": "X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1",
            "relativePath": "Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1",
            "type": "file",
            "size": 183494656,
            "extension": ".avi"
        };
        tempTargetFileFullPath = `X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1\\${TEMP_FILE_PREFIX}Alfred.Hitchcock.Presents.S01E01.avi`;
    })
    describe('makeJobOptions - convert', () => {
        it('job id should start with convert video identifier', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
            }) as ConvertJobOptions;
            assert.isTrue(options.jobID.startsWith(CONVERT_VIDEO_JOB_NAME));
        });
        it('new job options state should be pending', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
            }) as ConvertJobOptions;
            assert.equal(options.state, "pending");
        });
        it('new job options task should be convert', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
            }) as ConvertJobOptions;
            assert.equal(options.task, "convert");
        });
        it('when container format is specified and different the target file full path should reflect that', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                savePath: join(__dirname, "output", "video-converter-output"),
                targetContainerFormat: ".mkv",
            }) as ConvertJobOptions;
            const expectedTargetFile = join(__dirname, "output", "video-converter-output", "Alfred.Hitchcock.Presents.S01E01.mkv");
            assert.equal(options.commandOptions.targetFileFullPath, expectedTargetFile);
        });
        it('throws error when job target file would collide with source file without deleteSourceAfterConvert being true', () => {
            assert.throws(() => {
                JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                    ...defaultAppOptions,
                    saveInPlace: true,
                }) as ConvertJobOptions;
            }, (new SourceTargetCollisionError()).message);
        });
        it('when target fill will overwrite source file and deleteSourceAfterConvert is true the target file full path should have temp token prepended on the file name', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                saveInPlace: true,
                deleteSourceAfterConvert: true,
            }) as ConvertJobOptions;
            assert.equal(options.commandOptions.targetFileFullPath, tempTargetFileFullPath, "expected target file full path to have temp token prepended to file name");
        });
        it('when copy relative path is true the target file should copy the relative path after the provided save path', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                savePath: join(__dirname, "output", "video-converter-output"),
                copyRelativeFolderPath: true,
            }) as ConvertJobOptions;
            const expectedTargetFile = join(__dirname, "output", "video-converter-output", "Alfred Hitchcock Presents", "Alfred Hitchcock Presents Season 1", "Alfred.Hitchcock.Presents.S01E01.avi");
            assert.equal(options.commandOptions.targetFileFullPath, expectedTargetFile);
        });


        it('when ffprobeCommand is set the baseCommand convert job options will be set appropriately', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                ffmpegCommand: "ffmpeg",
            }) as ConvertJobOptions;
            assert.equal(options.baseCommand, "ffmpeg")
        });
        it('when ffprobeCommand is set the getInfoCommand convert job options will be set appropriately', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                ffprobeCommand: "ffprobe",
            }) as ConvertJobOptions;
            assert.equal(options.getInfoCommand, "ffprobe")
        });
        it('when deleteSourceAfterConvert is set the deleteSourceAfterConvert convert job options will be set appropriately', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                deleteSourceAfterConvert: true,
            }) as ConvertJobOptions;
            assert.equal(options.deleteSourceAfterConvert, true)
        });
        it('when keepInvalidConvertResult is set the keepInvalidConvertResult convert job options will be set appropriately', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                keepInvalidConvertResult: true,
            }) as ConvertJobOptions;
            assert.equal(options.keepInvalidConvertResult, true)
        });
        it('when convertVideoAllowClobber is set the allowClobberExisting convert job options will be set appropriately', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                convertVideoAllowClobber: true,
            }) as ConvertJobOptions;
            assert.equal(options.allowClobberExisting, true)
        });
        it('when convertVideoSkipConvertExisting is set the skipConvertExisting convert job options will be set appropriately', () => {
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                convertVideoSkipConvertExisting: true,
            }) as ConvertJobOptions;
            assert.equal(options.skipConvertExisting, true)
        });
        it('when skipIfVideoCodecNameMatch is set the ConvertJobOptions; convert job options will be set appropriately', () => {
            const codecsToSkip = ["hevc"];
            const options = JobFactory.makeJobOptions(logger, "convert", sourceFileInfo, {
                ...defaultAppOptions,
                skipIfVideoCodecNameMatch: codecsToSkip,
            }) as ConvertJobOptions;
            assert.equal(options.skipVideoCodecName, codecsToSkip)
        });
    });
});