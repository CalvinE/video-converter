import { FAILURE_REASON_TARGET_FAILED_INTEGRITY_CHECK, FAILURE_REASON_SOURCE_FAILED_INTEGRITY_CHECK } from './../../Jobs/ConvertVideoJob';
import { TEMP_FILE_PREFIX } from './../../Jobs/JobFactory';
import { ConvertJobOptions, ConvertVideoJobResult, IntegrityCheckResult, VideoInfo } from './../../VideoConverter';
import { MockFileManager } from './../../FileManager/MockFileManager';
import { NoopOutputWriter } from './../../OutputWriter/NoopOutputWriter';
import { NoopLogger } from './../../Logger/NoopLogger';
import { IOutputWriter } from './../../OutputWriter';
import { ILogger } from '../../Logger';
import { JobFactory } from '../../Jobs/JobFactory';
import { assert } from 'chai';
import { IFileManager, FileInfo } from '../../FileManager/FileManager';


const sourceFile: FileInfo = {
    "fullPath": "X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1\\Alfred.Hitchcock.Presents.S01E01.avi",
    "name": "Alfred.Hitchcock.Presents.S01E01.avi",
    "pathToItem": "X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1",
    "relativePath": "Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1",
    "type": "file",
    "size": 123,
    "extension": ".avi"
};

const sourceVideoInfo: VideoInfo = {
    "streams": [
        {
            "index": 0,
            "codec_name": "mpeg4",
            "codec_long_name": "MPEG-4 part 2",
            "profile": "Advanced Simple Profile",
            "codec_type": "video",
            "codec_tag_string": "XVID",
            "codec_tag": "0x44495658",
            "width": 560,
            "height": 416,
            "coded_width": 560,
            "coded_height": 416,
            "closed_captions": 0,
            "film_grain": 0,
            "has_b_frames": 1,
            "sample_aspect_ratio": "1:1",
            "display_aspect_ratio": "35:26",
            "pix_fmt": "yuv420p",
            "level": 5,
            "chroma_location": "left",
            "refs": 1,
            "quarter_sample": "false",
            "divx_packed": "false",
            "r_frame_rate": "25/1",
            "avg_frame_rate": "25/1",
            "time_base": "1/25",
            "start_pts": 0,
            "start_time": "0.000000",
            "duration_ts": 37711,
            "duration": "1508.440000",
            "bit_rate": "856697",
            "nb_frames": "37711",
            "extradata_size": 58,
            "disposition": {
                "default": 0,
                "dub": 0,
                "original": 0,
                "comment": 0,
                "lyrics": 0,
                "karaoke": 0,
                "forced": 0,
                "hearing_impaired": 0,
                "visual_impaired": 0,
                "clean_effects": 0,
                "attached_pic": 0,
                "timed_thumbnails": 0,
                "captions": 0,
                "descriptions": 0,
                "metadata": 0,
                "dependent": 0,
                "still_image": 0
            }
        },
        {
            "index": 1,
            "codec_name": "mp3",
            "codec_long_name": "MP3 (MPEG audio layer 3)",
            "codec_type": "audio",
            "codec_tag_string": "U[0][0][0]",
            "codec_tag": "0x0055",
            "sample_fmt": "fltp",
            "sample_rate": "48000",
            "channels": 2,
            "channel_layout": "stereo",
            "bits_per_sample": 0,
            "r_frame_rate": "0/0",
            "avg_frame_rate": "0/0",
            "time_base": "3/125",
            "start_pts": 0,
            "start_time": "0.000000",
            "duration_ts": 62852,
            "duration": "1508.448000",
            "bit_rate": "103576",
            "nb_frames": "62852",
            "extradata_size": 12,
            "disposition": {
                "default": 0,
                "dub": 0,
                "original": 0,
                "comment": 0,
                "lyrics": 0,
                "karaoke": 0,
                "forced": 0,
                "hearing_impaired": 0,
                "visual_impaired": 0,
                "clean_effects": 0,
                "attached_pic": 0,
                "timed_thumbnails": 0,
                "captions": 0,
                "descriptions": 0,
                "metadata": 0,
                "dependent": 0,
                "still_image": 0
            }
        }
    ],
    "format": {
        "filename": "X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1\\Alfred.Hitchcock.Presents.S01E01.avi",
        "nb_streams": 2,
        "nb_programs": 0,
        "format_name": "avi",
        "format_long_name": "AVI (Audio Video Interleaved)",
        "start_time": "0.000000",
        "duration": "1508.448000",
        "size": "183494656",
        "bit_rate": "973157",
        "probe_score": 100,
        "tags": {
            "software": "VirtualDubMod 1.5.4.1 (build 2178/release)",
            "IAS1": "English"
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const sourceVideoIntegrityCheck: IntegrityCheckResult = {
    "isVideoGood": true,
    "issues": {
        "audioStreamMissing": false,
        "containerInfoMissing": false,
        "getVideoInfoFailed": false,
        "isEmptyFile": false,
        "fileDoesNotExist": false,
        "videoStreamIsRaw": false,
        "videoStreamMissing": false
    }
};

const sourceFailedVideoIntegrityCheck: IntegrityCheckResult = {
    "isVideoGood": false,
    "issues": {
        "audioStreamMissing": false,
        "containerInfoMissing": false,
        "getVideoInfoFailed": false,
        "isEmptyFile": false,
        "fileDoesNotExist": false,
        "videoStreamIsRaw": true,
        "videoStreamMissing": false
    }
};

const targetVideoInfo: VideoInfo = {
    "streams": [
        {
            "index": 0,
            "codec_name": "hevc",
            "codec_long_name": "H.265 / HEVC (High Efficiency Video Coding)",
            "profile": "Main",
            "codec_type": "video",
            "codec_tag_string": "hev1",
            "codec_tag": "0x31766568",
            "width": 560,
            "height": 416,
            "coded_width": 560,
            "coded_height": 416,
            "closed_captions": 0,
            "film_grain": 0,
            "has_b_frames": 2,
            "sample_aspect_ratio": "1:1",
            "display_aspect_ratio": "35:26",
            "pix_fmt": "yuv420p",
            "level": 63,
            "color_range": "tv",
            "chroma_location": "left",
            "refs": 1,
            "r_frame_rate": "25/1",
            "avg_frame_rate": "25/1",
            "time_base": "1/25",
            "start_pts": 0,
            "start_time": "0.000000",
            "duration_ts": 37711,
            "duration": "1508.440000",
            "bit_rate": "117206",
            "nb_frames": "37711",
            "extradata_size": 85,
            "disposition": {
                "default": 0,
                "dub": 0,
                "original": 0,
                "comment": 0,
                "lyrics": 0,
                "karaoke": 0,
                "forced": 0,
                "hearing_impaired": 0,
                "visual_impaired": 0,
                "clean_effects": 0,
                "attached_pic": 0,
                "timed_thumbnails": 0,
                "captions": 0,
                "descriptions": 0,
                "metadata": 0,
                "dependent": 0,
                "still_image": 0
            }
        },
        {
            "index": 1,
            "codec_name": "mp3",
            "codec_long_name": "MP3 (MPEG audio layer 3)",
            "codec_type": "audio",
            "codec_tag_string": "U[0][0][0]",
            "codec_tag": "0x0055",
            "sample_fmt": "fltp",
            "sample_rate": "48000",
            "channels": 2,
            "channel_layout": "stereo",
            "bits_per_sample": 0,
            "r_frame_rate": "0/0",
            "avg_frame_rate": "0/0",
            "time_base": "3/125",
            "start_pts": 0,
            "start_time": "0.000000",
            "duration_ts": 62854,
            "duration": "1508.496000",
            "bit_rate": "103576",
            "nb_frames": "62854",
            "extradata_size": 12,
            "disposition": {
                "default": 0,
                "dub": 0,
                "original": 0,
                "comment": 0,
                "lyrics": 0,
                "karaoke": 0,
                "forced": 0,
                "hearing_impaired": 0,
                "visual_impaired": 0,
                "clean_effects": 0,
                "attached_pic": 0,
                "timed_thumbnails": 0,
                "captions": 0,
                "descriptions": 0,
                "metadata": 0,
                "dependent": 0,
                "still_image": 0
            }
        }
    ],
    "format": {
        "filename": "D:\\result\\fast\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1\\Alfred.Hitchcock.Presents.S01E01.avi",
        "nb_streams": 2,
        "nb_programs": 0,
        "format_name": "avi",
        "format_long_name": "AVI (Audio Video Interleaved)",
        "start_time": "0.000000",
        "duration": "1508.496000",
        "size": "44071794",
        "bit_rate": "233725",
        "probe_score": 100,
        "tags": {
            "IAS1": "English",
            "software": "Lavf59.16.100"
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const targetVideoIntegrityCheck: IntegrityCheckResult = {
    "isVideoGood": true,
    "issues": {
        "audioStreamMissing": false,
        "containerInfoMissing": false,
        "getVideoInfoFailed": false,
        "isEmptyFile": false,
        "fileDoesNotExist": false,
        "videoStreamIsRaw": false,
        "videoStreamMissing": false
    }
};

const targetFailedVideoIntegrityCheck: IntegrityCheckResult = {
    "isVideoGood": false,
    "issues": {
        "audioStreamMissing": false,
        "containerInfoMissing": false,
        "getVideoInfoFailed": false,
        "isEmptyFile": false,
        "fileDoesNotExist": false,
        "videoStreamIsRaw": true,
        "videoStreamMissing": false
    }
};

const tempTargetFileFullPath = `X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1\\${TEMP_FILE_PREFIX}Alfred.Hitchcock.Presents.S01E01.avi`;
const removedTempTargetFileFullPath = tempTargetFileFullPath.replace(TEMP_FILE_PREFIX, "");

const otherTargetFileFullPath = `X:\\video\\TV_Series\\Alfred Hitchcock Presents\\Alfred Hitchcock Presents Season 1\\Alfred.Hitchcock.Presents.S01E01.mkv`;

const defaultConvertJobOptions: ConvertJobOptions = {
    task: "convert",
    allowClobberExisting: false,
    deleteSourceAfterConvert: false,
    sourceFileInfo: sourceFile,
    baseCommand: "noop",
    checkVideoIntegrityCommandOptions: {
        timeoutMilliseconds: 1000,
        xArgs: [],
    },
    getInfoCommand: "noop",
    host: "test",
    jobID: "text convert job id",
    keepInvalidConvertResult: false,
    skipConvertExisting: false,
    skipVideoCodecName: [],
    state: "pending",
    mockData: {
        useMockVideoConvert: true,
        sourceVideoInfo,
        sourceVideoIntegrityCheck,
        targetVideoInfo,
        targetVideoIntegrityCheck,
    },
    commandOptions: {
        targetAudioEncoding: "copy",
        targetContainerFormat: ".avi",
        targetVideoEncoding: "copy",
        useCuda: false,
        targetFileFullPath: "",
        timeoutMilliseconds: 1000,
        xArgs: [],
    }
};

describe('ConvertVideoJob', () => {
    let logger: ILogger;
    let outputWriter: IOutputWriter;
    let fileManager: IFileManager;
    beforeEach(() => {
        logger = new NoopLogger("debug");
        outputWriter = new NoopOutputWriter();
        fileManager = new MockFileManager([
            sourceFile,
        ]);
    });
    it('source and target files being the same results in a failure and only the source file remains', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions
        };
        convertJobOptions.commandOptions.targetFileFullPath = sourceFile.fullPath;
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result = await convertJob.execute();
        assert.exists(result.failureReason);
        assert.isFalse(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 1);
        assert.equal(fsContents[0].fullPath, sourceFile.fullPath);
    });
    it('non conflicting source and target files result in two separate files', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions
        };
        convertJobOptions.commandOptions.targetFileFullPath = otherTargetFileFullPath;
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.notExists(result.failureReason);
        assert.isTrue(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 2);
        const fsSourceFile = fsContents.find(f => f.fullPath === sourceFile.fullPath);
        assert.exists(fsSourceFile);
        const fsTargetFile = fsContents.find(f => f.fullPath === otherTargetFileFullPath);
        assert.exists(fsTargetFile);
    });
    it('non conflicting source and target files result in one file when deleteSourceAfterConvert is true', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions,
            deleteSourceAfterConvert: true
        };
        convertJobOptions.commandOptions.targetFileFullPath = otherTargetFileFullPath;
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.notExists(result.failureReason);
        assert.isTrue(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 1);
        const fsTargetFile = fsContents.find(f => f.fullPath === otherTargetFileFullPath);
        assert.exists(fsTargetFile);
    });
    it('source file failed integrity check results failed job', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions
        };
        convertJobOptions.commandOptions.targetFileFullPath = otherTargetFileFullPath;
        convertJobOptions.mockData = {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...convertJobOptions.mockData!,
            sourceVideoIntegrityCheck: sourceFailedVideoIntegrityCheck,
        };
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.equal(result.failureReason, FAILURE_REASON_SOURCE_FAILED_INTEGRITY_CHECK);
        assert.isFalse(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 1);
        const fsSourceFile = fsContents.find(f => f.fullPath === sourceFile.fullPath);
        assert.exists(fsSourceFile);
        const fsTargetFile = fsContents.find(f => f.fullPath === otherTargetFileFullPath);
        assert.notExists(fsTargetFile);
    });
    it('converted file failed integrity check results in invalid converted file being deleted', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions
        };
        convertJobOptions.commandOptions.targetFileFullPath = otherTargetFileFullPath;
        convertJobOptions.mockData = {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...convertJobOptions.mockData!,
            targetVideoIntegrityCheck: targetFailedVideoIntegrityCheck,
        };
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.equal(result.failureReason, FAILURE_REASON_TARGET_FAILED_INTEGRITY_CHECK);
        assert.isFalse(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 1);
        const fsSourceFile = fsContents.find(f => f.fullPath === sourceFile.fullPath);
        assert.exists(fsSourceFile);
        const fsTargetFile = fsContents.find(f => f.fullPath === otherTargetFileFullPath);
        assert.notExists(fsTargetFile);
    });
    it('converted file failed integrity check results in invalid converted file being kept when keepInvalidConvertResult is true', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions,
            keepInvalidConvertResult: true,
        };
        convertJobOptions.commandOptions.targetFileFullPath = otherTargetFileFullPath;
        convertJobOptions.mockData = {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...convertJobOptions.mockData!,
            targetVideoIntegrityCheck: targetFailedVideoIntegrityCheck,
        };
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.equal(result.failureReason, FAILURE_REASON_TARGET_FAILED_INTEGRITY_CHECK);
        assert.isFalse(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 2);
        const fsSourceFile = fsContents.find(f => f.fullPath === sourceFile.fullPath);
        assert.exists(fsSourceFile);
        const fsTargetFile = fsContents.find(f => f.fullPath === otherTargetFileFullPath);
        assert.exists(fsTargetFile);
    });
    it('target file full path that has TEMP token in file name and otherwise is identical to the source file full path will overwrite the original', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions
        };
        convertJobOptions.commandOptions.targetFileFullPath = tempTargetFileFullPath;
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.notExists(result.failureReason);
        assert.isTrue(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 1);
        assert.equal(fsContents[0].fullPath, removedTempTargetFileFullPath);
    });
    it('deleteSourceAfterConvert set to true target file full path that has TEMP token in file name and otherwise is identical to the source file full path will overwrite the original', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions,
            deleteSourceAfterConvert: true,
        };
        convertJobOptions.commandOptions.targetFileFullPath = tempTargetFileFullPath;
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.notExists(result.failureReason);
        assert.isTrue(result.success);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 1);
        assert.equal(fsContents[0].fullPath, removedTempTargetFileFullPath);
    });
    it('video conversion will be skipped when source video codec name matches skipVideoCodecName parameter', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions,
            skipVideoCodecName: ["mpeg4"],
        };
        convertJobOptions.commandOptions.targetFileFullPath = tempTargetFileFullPath;
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.notExists(result.failureReason);
        assert.isTrue(result.success);
        assert.isTrue(result.skipped);
        assert.exists(result.skippedReason);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 1);
        assert.equal(fsContents[0].fullPath, removedTempTargetFileFullPath);
    });
    it('video conversion will be skipped when the target video exists and skipConvertExisting is true', async () => {
        const convertJobOptions: ConvertJobOptions = {
            ...defaultConvertJobOptions,
            skipConvertExisting: true,
        };
        fileManager.writeFile(otherTargetFileFullPath, "the target file already exists", false);
        convertJobOptions.commandOptions.targetFileFullPath = otherTargetFileFullPath;
        const convertJob = JobFactory.makeJob(logger, outputWriter, fileManager, convertJobOptions);
        const result: ConvertVideoJobResult = await convertJob.execute() as ConvertVideoJobResult;
        assert.notExists(result.failureReason);
        assert.isTrue(result.success);
        assert.isTrue(result.skipped);
        assert.exists(result.skippedReason);
        const fsContents = fileManager.enumerateDirectory("", 0);
        assert.equal(fsContents.length, 2);
        const fsSourceFile = fsContents.find(f => f.fullPath === sourceFile.fullPath);
        assert.exists(fsSourceFile);
        const fsTargetFile = fsContents.find(f => f.fullPath === otherTargetFileFullPath);
        assert.exists(fsTargetFile);
    });
});