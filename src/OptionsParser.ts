import { VideoContainerFormat, AudioEncoder, VideoEncoder, INVALID } from './VideoConverter/models';
import { argv, stdout } from "process";
import { EOL } from "os";
import { dateToFileSafeDate } from './PrettyPrint';
import { join } from 'path';
import { normalizeString } from './util';
import { existsSync, readFileSync } from 'fs';

const DEFAULT_APPROVED_FILE_EXTENSIONS: string[] = [".mp4", ".mkv", ".avi", ".mov"];
const DEFAULT_GET_INFO_COMMAND_TIMEOUT_MILLISECONDS = 10000;
const DEFAULT_FFMPEG_COMMAND = "ffmpeg";
const DEFAULT_FFPROBE_COMMAND = "ffprobe";
const DEFAULT_SAVE_PATH = join(".", "output", "video-converter-output");
// const DEFAULT_FILES_TO_COPY: string[] = [".jpg", ".srt"];

const SOURCE_PATH_OPTION_NAME = "sourcePath";
const USE_CUDA_OPTION_NAME = "useCuda";
const ALLOWED_FILE_EXTENSIONS_OPTION_NAME = "allowedFileExtensions";
const FILES_TO_COPY_REGEX_OPTION_NAME = "fileCopyRegex";
const FILES_TO_COPY_EXTENSIONS_OPTION_NAME = "fileCopyExtensions";
const TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME = "targetContainerFormat";
const TARGET_AUDIO_ENCODER_PATH_OPTION_NAME = "targetAudioEncoder";
const TARGET_VIDEO_ENCODER_PATH_OPTION_NAME = "targetVideoEncoder";
const TARGET_FILE_NAME_REGEX_OPTION_NAME = "targetFileNameRegex";
const SAVE_PATH_OPTION_NAME = "savePath";
const COPY_RELATIVE_FOLDER_PATHS = "copyRelativeFolderPath";
const SAVE_IN_PLACE_OPTION_NAME = "saveInPlace"; // If this is set to true we need to add it to the convert job options. The file will need to be converted with a temp random name and then once done and the integrity check passes unlink the old one and rename the temp to the old name...
const GET_INFO_OPTION_NAME = "getInfo";
const GET_VIDEO_INFO_TIMEOUT_MILLISECONDS_OPTIONS_NAME = "getVideoInfoTimeoutMilliseconds";
const CONVERT_VIDEO_OPTION_NAME = "convertVideo";
const CONVERT_VIDEO_TIMEOUT_MILLISECONDS_OPTIONS_NAME = "convertVideoTimeoutMilliseconds";
const CONVERT_VIDEO_ALLOW_CLOBBER_OPTION_NAME = "convertVideoAllowClobber";
const CONVERT_VIDEO_SKIP_CONVERT_EXISTING_OPTION_NAME = "convertVideoSkipConvertExisting";
const CHECK_VIDEO_INTEGRITY_OPTION_NAME = "checkVideoIntegrity"
const SAVE_JOB_FILE_ONLY_OPTION_NAME = "saveJobFileOnly";
const JOB_FILE_PATH_OPTION_NAME = "jobFile";
// const CONCURRENT_JOBS_OPTION_NAME = "concurrentJobs";
const DELETE_SOURCE_AFTER_CONVERT_OPTION_NAME = "deleteSourceAfterConvert"
const KEEP_FAILED_INTEGRITY_CONVERTED_OPTION_NAME = "keepInvalidConvertResult";
const DELETE_FAILED_INTEGRITY_CHECK_FILES_OPTION_NAME = "deleteFailedIntegrityCheckFiles";
const X_ARGS_OPTION_NAME = "xArgs"
const FFMPEG_COMMAND_OPTION_NAME = "ffmpegCommand";
const FFPROBE_COMMAND_OPTION_NAME = "ffprobeCommand";
const SKIP_IF_VIDEO_CODEC_NAME_MATCH = "skipIfVideoCodecNameMatch";
const OPTIONS_FILE_OPTION_NAME = "optionsFile";
const HELP_OPTION_NAME = "help";

export type AppOptions = {
    [SOURCE_PATH_OPTION_NAME]: string;
    [FILES_TO_COPY_REGEX_OPTION_NAME]?: RegExp;
    [FILES_TO_COPY_EXTENSIONS_OPTION_NAME]: string[];
    [USE_CUDA_OPTION_NAME]: boolean;
    [ALLOWED_FILE_EXTENSIONS_OPTION_NAME]: string[];
    [TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME]: VideoContainerFormat;
    [TARGET_AUDIO_ENCODER_PATH_OPTION_NAME]: AudioEncoder;
    [TARGET_VIDEO_ENCODER_PATH_OPTION_NAME]: VideoEncoder;
    [TARGET_FILE_NAME_REGEX_OPTION_NAME]?: RegExp;
    [SAVE_PATH_OPTION_NAME]: string;
    [COPY_RELATIVE_FOLDER_PATHS]: boolean;
    [SAVE_IN_PLACE_OPTION_NAME]: boolean;
    [GET_INFO_OPTION_NAME]: boolean;
    [GET_VIDEO_INFO_TIMEOUT_MILLISECONDS_OPTIONS_NAME]: number;
    [CONVERT_VIDEO_OPTION_NAME]: boolean;
    [CONVERT_VIDEO_TIMEOUT_MILLISECONDS_OPTIONS_NAME]: number;
    [CONVERT_VIDEO_ALLOW_CLOBBER_OPTION_NAME]: boolean;
    [CONVERT_VIDEO_SKIP_CONVERT_EXISTING_OPTION_NAME]: boolean;
    [CHECK_VIDEO_INTEGRITY_OPTION_NAME]: boolean;
    [SAVE_JOB_FILE_ONLY_OPTION_NAME]: boolean;
    [JOB_FILE_PATH_OPTION_NAME]: string;
    // [CONCURRENT_JOBS_OPTION_NAME]: number;
    [DELETE_SOURCE_AFTER_CONVERT_OPTION_NAME]: boolean;
    [KEEP_FAILED_INTEGRITY_CONVERTED_OPTION_NAME]: boolean;
    [DELETE_FAILED_INTEGRITY_CHECK_FILES_OPTION_NAME]: boolean;
    [X_ARGS_OPTION_NAME]: string[];
    [FFMPEG_COMMAND_OPTION_NAME]: string;
    [FFPROBE_COMMAND_OPTION_NAME]: string;
    [SKIP_IF_VIDEO_CODEC_NAME_MATCH]: string;
    [OPTIONS_FILE_OPTION_NAME]: string | undefined;
    [HELP_OPTION_NAME]: boolean;
}

export const defaultAppOptions: AppOptions = {
    sourcePath: "",
    useCuda: false,
    fileCopyExtensions: [],
    allowedFileExtensions: DEFAULT_APPROVED_FILE_EXTENSIONS,
    targetContainerFormat: "copy",
    targetAudioEncoder: "copy",
    targetVideoEncoder: "copy",
    savePath: DEFAULT_SAVE_PATH,
    saveInPlace: false,
    copyRelativeFolderPath: false,
    getInfo: false,
    getVideoInfoTimeoutMilliseconds: DEFAULT_GET_INFO_COMMAND_TIMEOUT_MILLISECONDS,
    convertVideo: false,
    convertVideoTimeoutMilliseconds: 0,
    convertVideoAllowClobber: false,
    convertVideoSkipConvertExisting: false,
    checkVideoIntegrity: false,
    saveJobFileOnly: false,
    jobFile: join(".", "output", "jobs", `${dateToFileSafeDate(new Date())}-video-converter-job.json`),
    // concurrentJobs: 1,
    deleteSourceAfterConvert: false,
    keepInvalidConvertResult: false,
    deleteFailedIntegrityCheckFiles: false,
    xArgs: [],
    skipIfVideoCodecNameMatch: "",
    optionsFile: undefined,
    ffmpegCommand: DEFAULT_FFMPEG_COMMAND,
    ffprobeCommand: DEFAULT_FFPROBE_COMMAND,
    help: false,
}

function safeQuoteXArg(arg: string): string {
    const sarg = arg?.toString() ?? "";
    if (sarg?.indexOf(" ") >= 0) {
        return `"${arg}"`
    }
    return sarg;
}

// cmd options are passed with preceding 2 dahses EX: --help
export function ParseOptions(): AppOptions {
    // Initialize with defaults
    let optionsFileOptions: Partial<AppOptions> = {};
    let optionsFile: string;
    const options: AppOptions = defaultAppOptions;
    for (let i = 2; i < argv.length; i++) {
        const currentArg = argv[i];
        if (!currentArg?.startsWith("--")) {
            // All parameters start with -- so it does not start with -- we ignore it?
            continue;
        }
        switch (currentArg.substring(2)) {
            case HELP_OPTION_NAME:
                options[HELP_OPTION_NAME] = true;
                break;
            case X_ARGS_OPTION_NAME:
                // eslint-disable-next-line no-case-declarations
                const xargs = argv[++i];
                // const xargs = JSON.parse(argv[++i]);
                // if (Array.isArray(xargs)) {
                //     const args = xargs.map((x) => safeQuoteXArg(x));
                //     options[X_ARGS_OPTION_NAME].push(...args);
                // } else {
                options[X_ARGS_OPTION_NAME].push(safeQuoteXArg(xargs as string));
                // }
                break;
            case SOURCE_PATH_OPTION_NAME:
                options[SOURCE_PATH_OPTION_NAME] = argv[++i];
                break;
            case USE_CUDA_OPTION_NAME:
                options[USE_CUDA_OPTION_NAME] = true;
                break;
            case FILES_TO_COPY_EXTENSIONS_OPTION_NAME:
                // eslint-disable-next-line no-case-declarations
                const copyExtension = argv[++i] ?? "";
                if (copyExtension.length > 0) {
                    options[FILES_TO_COPY_EXTENSIONS_OPTION_NAME] = copyExtension.split(",").map((s) => s.toLowerCase())
                } else {
                    stdout.write(`${FILES_TO_COPY_EXTENSIONS_OPTION_NAME} cannot be empty: ${copyExtension}${EOL}`);
                    return {
                        ...options,
                        help: true
                    }
                }
                break;
            case ALLOWED_FILE_EXTENSIONS_OPTION_NAME:
                // eslint-disable-next-line no-case-declarations
                const processExtension = argv[++i] ?? "";
                if (processExtension.length > 0) {
                    options[ALLOWED_FILE_EXTENSIONS_OPTION_NAME] = processExtension.split(",").map((s) => s.toLowerCase())
                } else {
                    stdout.write(`${ALLOWED_FILE_EXTENSIONS_OPTION_NAME} cannot be empty: ${processExtension}${EOL}`);
                    return {
                        ...options,
                        help: true
                    }
                }
                break;
            case TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME:
                options[TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME] = (argv[++i] as VideoContainerFormat) ?? INVALID;
                break;
            case TARGET_AUDIO_ENCODER_PATH_OPTION_NAME:
                options[TARGET_AUDIO_ENCODER_PATH_OPTION_NAME] = (argv[++i] as AudioEncoder) ?? INVALID;
                break;
            case TARGET_VIDEO_ENCODER_PATH_OPTION_NAME:
                options[TARGET_VIDEO_ENCODER_PATH_OPTION_NAME] = (argv[++i] as VideoEncoder) ?? INVALID;
                break;
            case FILES_TO_COPY_REGEX_OPTION_NAME:
                // eslint-disable-next-line no-case-declarations
                const copyRegexString = argv[++i];
                try {
                    // FIXME: for now all regex provided will be case insensitive...
                    options[FILES_TO_COPY_REGEX_OPTION_NAME] = new RegExp(copyRegexString, "i");
                } catch (err) {
                    throw new Error(`${FILES_TO_COPY_REGEX_OPTION_NAME} regex is not valid "${copyRegexString}" : ${err}`)
                }
                break;
            case TARGET_FILE_NAME_REGEX_OPTION_NAME:
                // eslint-disable-next-line no-case-declarations
                const targetRegexString = argv[++i];
                try {
                    // FIXME: for now all regex provided will be case insensitive...
                    options[TARGET_FILE_NAME_REGEX_OPTION_NAME] = new RegExp(targetRegexString, "i");
                } catch (err) {
                    throw new Error(`${TARGET_FILE_NAME_REGEX_OPTION_NAME} regex is not valid "${targetRegexString}" : ${err}`)
                }
                break;
            case SAVE_PATH_OPTION_NAME:
                options[SAVE_PATH_OPTION_NAME] = argv[++i];
                break;
            case SAVE_IN_PLACE_OPTION_NAME:
                options[SAVE_IN_PLACE_OPTION_NAME] = true;
                break;
            case COPY_RELATIVE_FOLDER_PATHS:
                options[COPY_RELATIVE_FOLDER_PATHS] = true;
                break;
            case GET_INFO_OPTION_NAME:
                options[GET_INFO_OPTION_NAME] = true;
                break;
            case CONVERT_VIDEO_OPTION_NAME:
                options[CONVERT_VIDEO_OPTION_NAME] = true;
                break;
            case CONVERT_VIDEO_ALLOW_CLOBBER_OPTION_NAME:
                options[CONVERT_VIDEO_ALLOW_CLOBBER_OPTION_NAME] = true;
                break;
            case CONVERT_VIDEO_SKIP_CONVERT_EXISTING_OPTION_NAME:
                options[CONVERT_VIDEO_SKIP_CONVERT_EXISTING_OPTION_NAME] = true;
                break;
            case CHECK_VIDEO_INTEGRITY_OPTION_NAME:
                options[CHECK_VIDEO_INTEGRITY_OPTION_NAME] = true;
                break;
            case SAVE_JOB_FILE_ONLY_OPTION_NAME:
                options[SAVE_JOB_FILE_ONLY_OPTION_NAME] = true;
                break;
            case JOB_FILE_PATH_OPTION_NAME:
                options[JOB_FILE_PATH_OPTION_NAME] = argv[++i];
                break;
            case KEEP_FAILED_INTEGRITY_CONVERTED_OPTION_NAME:
                options[KEEP_FAILED_INTEGRITY_CONVERTED_OPTION_NAME] = true;
                break;
            case DELETE_FAILED_INTEGRITY_CHECK_FILES_OPTION_NAME:
                options[DELETE_FAILED_INTEGRITY_CHECK_FILES_OPTION_NAME] = true;
                break;
            case SKIP_IF_VIDEO_CODEC_NAME_MATCH:
                options[SKIP_IF_VIDEO_CODEC_NAME_MATCH] = normalizeString(argv[++i]);
                break;
            // case CONCURRENT_JOBS_OPTION_NAME:
            //     // eslint-disable-next-line no-case-declarations
            //     const concurrentJobsString = argv[++i];
            //     // eslint-disable-next-line no-case-declarations
            //     const concurrentJobsNumber = parseInt(concurrentJobsString, 10);
            //     if (isNaN(concurrentJobsNumber) || concurrentJobsNumber <= 0) {
            //         throw new Error(`${CONCURRENT_JOBS_OPTION_NAME} options was not a valid positive number greater than zero: ${concurrentJobsString}`);
            //     }
            //     options[CONCURRENT_JOBS_OPTION_NAME] = concurrentJobsNumber;
            //     break;
            case DELETE_SOURCE_AFTER_CONVERT_OPTION_NAME:
                options[DELETE_SOURCE_AFTER_CONVERT_OPTION_NAME] = true;
                break;
            case OPTIONS_FILE_OPTION_NAME:
                optionsFile = argv[++i];
                if (!existsSync(optionsFile)) {
                    throw new Error(`options file specified does not exist: ${optionsFile}`);
                }
                optionsFileOptions = JSON.parse(readFileSync(optionsFile, { encoding: "utf8" })) as Partial<AppOptions>;
                break;
            default:
                // If we get here we did something wrong... print help and return?
                // FIXME: abstract how this is output?
                stdout.write(`invalid arg provided: ${argv[i]}${EOL}`);
                return {
                    ...options,
                    help: true, // force help to true so help text also prints...
                };
        }

    }
    return {
        ...optionsFileOptions,
        ...options
    };
}

export function PrintHelp() {
    // TODO: Write this and make some data in here to keep track of the info for the help data...
    const helpData: {
        name: string,
        description: string,
    }[] = [
            {
                name: SOURCE_PATH_OPTION_NAME,
                description: "The path that will be searched for files to process.",
            },
            {
                name: FILES_TO_COPY_EXTENSIONS_OPTION_NAME,
                description: "A comma separated list of file extensions to use when a file should be copied. (Case Insensitive)",
            },
            {
                name: FILES_TO_COPY_REGEX_OPTION_NAME,
                description: "a regular expression that will be applied to each file in the source path. When a match occurs the file will be copied. (Case Insensitive)",
            },
            {
                name: USE_CUDA_OPTION_NAME,
                description: "A flag. When provided will add flags to FFMPEG to support hardware accelerated encoders.",
            },
            {
                name: ALLOWED_FILE_EXTENSIONS_OPTION_NAME,
                description: "A comma separated list of file extensions to use when assessing if a video should be transcoded. (Case Insensitive)",
            },
            {
                name: TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME,
                description: "The video container format (with or without the preceding .) that the transcoded video will be saved in. If not provided the video container format will not be changed.",
            },
            {
                name: TARGET_AUDIO_ENCODER_PATH_OPTION_NAME,
                description: "The audio encoder to use for the transcoding. If not provided the audio is copied in the transcoded file.",
            },
            {
                name: TARGET_VIDEO_ENCODER_PATH_OPTION_NAME,
                description: "The video encoder to use for the transcoding. If not provided the video is copied in the transcoded file.",
            },
            {
                name: TARGET_FILE_NAME_REGEX_OPTION_NAME,
                description: "a regular expression that will be applied to each file in the source path. When a match occurs the file will be processed. (Case Insensitive)",
            },
            {
                name: SAVE_PATH_OPTION_NAME,
                description: "Sets where the output will be placed.",
            },
            {
                name: COPY_RELATIVE_FOLDER_PATHS,
                description: "A flag. When present will duplicate the folder structure after --sourcePath in the --savePath",
            },
            {
                name: SAVE_IN_PLACE_OPTION_NAME,
                description: "A flag. When present converted video files will be placed in the same directory where the video to be converted is located.",
            },
            {
                name: GET_INFO_OPTION_NAME,
                description: "A flag. When present will get info about video files based on options provided.",
            },
            {
                name: CONVERT_VIDEO_OPTION_NAME,
                description: "A flag. When present will convert video files based on options provided.",
            },
            {
                name: CONVERT_VIDEO_ALLOW_CLOBBER_OPTION_NAME,
                description: `A flag. When present if a video exists in place where one will be created by conversion the existing copy will be deleted before conversion starts. DO NOT USE THIS IF YOU ARE CONVERTING FILES IN PLACE!`,
            },
            {
                name: CONVERT_VIDEO_SKIP_CONVERT_EXISTING_OPTION_NAME,
                description: "A flag. It is a weird setting that will skip over an existing file that matches the target file for a video convert job.",
            },
            {
                name: CHECK_VIDEO_INTEGRITY_OPTION_NAME,
                description: "A flag. When present will perform a integrity check of the video files that match other parameters listed.",
            },
            {
                name: SAVE_JOB_FILE_ONLY_OPTION_NAME,
                description: `A flag. when present the job file will be saved to the value of the ${JOB_FILE_PATH_OPTION_NAME} option, and the program will exit without performing the job.`,
            },
            {
                name: JOB_FILE_PATH_OPTION_NAME,
                description: `A path to a json job file. if none is provided a default will be generated. If the file provided does not exist it will be created and populated based on the other options provided.`,
            },
            {
                name: KEEP_FAILED_INTEGRITY_CONVERTED_OPTION_NAME,
                description: `A flag. When present in a convert job it will keep converted files that fail the video integrity check. By default they are deleted.`,
            },
            {
                name: DELETE_FAILED_INTEGRITY_CHECK_FILES_OPTION_NAME,
                description: `A flag. When present in a check integrity job it will delete files that fail the video integrity check. By default they are not deleted.`,
            },
            // {
            //     name: CONCURRENT_JOBS_OPTION_NAME,
            //     description: "(NOT IMPLEMENTED YET) A number representing how may jobs the should be processed at one time. Defaults to 1.",
            // },
            {
                name: DELETE_SOURCE_AFTER_CONVERT_OPTION_NAME,
                description: "A flag. When present the source file for convert jobs will be deleted after successful conversion.",
            },
            {
                name: SKIP_IF_VIDEO_CODEC_NAME_MATCH,
                description: "Tells the converter to skip a video if its codec name matches this parameter. For example: hevc to skip file already converted to H.265",
            },
            {
                name: OPTIONS_FILE_OPTION_NAME,
                description: "A path to a JSON file containing options for the video converter. These options are overridden by addition options passed in normally.",
            },
            {
                name: X_ARGS_OPTION_NAME,
                description: "Allows additional info to be passed in to FFMPEG or FFPROBE. Best to use once for each item to append to the command. Also supports a JSON array of strings.",
            },
            {
                name: HELP_OPTION_NAME,
                description: "A flag. when present displays help info.",
            },
        ];
    stdout.write(`video-converter usage:${EOL}`)
    stdout.write(`video-converter [OPTIONS]${EOL}`)
    stdout.write(EOL);
    stdout.write(`Available options:${EOL}`)
    for (const item of helpData) {
        stdout.write(`--${item.name} - ${item.description}${EOL}`)
    }
}