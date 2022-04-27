import { VideoContainerFormat, AudioEncoder, VideoEncoder, INVALID } from './VideoConverter/models';
import { argv, stdout } from "process";
import { EOL } from "os";

const DEFAULT_APPROVED_FILE_EXTENSIONS: string[] = ["mp4", "mkv", "avi", "mov"];

const SOURCE_PATH_OPTION_NAME = "sourcePath";
const USE_CUDA_OPTION_NAME = "useCuda";
const ALLOWED_FILE_EXTENSIONS_OPTION_NAME = "allowFileExtensions";
const TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME = "targetContainerFormat";
const TARGET_AUDIO_ENCODER_PATH_OPTION_NAME = "targetAudioEncoder";
const TARGET_VIDEO_ENCODER_PATH_OPTION_NAME = "targetVideoEncoder";
const TARGET_FILE_NAME_REGEX_OPTION_NAME = "targetFileNameRegex";
const SAVE_PATH_OPTION_NAME = "savePath";
const COPY_RELATIVE_FOLDER_PATHS = "copyRelativeFolderPath";
const SAVE_IN_PLACE = "saveInPlace";
const GET_INFO_OPTION_NAME = "getInfo";
const CONVERT_VIDEO_OPTION_NAME = "convertVideo"
const X_ARGS_OPTION_NAME = "xArgs"
const HELP_OPTION_NAME = "help";

export type AppOptions = {
    [SOURCE_PATH_OPTION_NAME]: string;
    [USE_CUDA_OPTION_NAME]: boolean;
    [ALLOWED_FILE_EXTENSIONS_OPTION_NAME]: string[];
    [TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME]: VideoContainerFormat;
    [TARGET_AUDIO_ENCODER_PATH_OPTION_NAME]: AudioEncoder;
    [TARGET_VIDEO_ENCODER_PATH_OPTION_NAME]: VideoEncoder;
    [TARGET_FILE_NAME_REGEX_OPTION_NAME]?: RegExp;
    [SAVE_PATH_OPTION_NAME]: string;
    [COPY_RELATIVE_FOLDER_PATHS]: boolean;
    [SAVE_IN_PLACE]: boolean;
    [GET_INFO_OPTION_NAME]: boolean;
    [CONVERT_VIDEO_OPTION_NAME]: boolean;
    [X_ARGS_OPTION_NAME]: string[];
    [HELP_OPTION_NAME]: boolean;
}

function safeQuoteXArg(arg: string): string {
    const sarg = arg?.toString() ?? "";
    if (sarg?.indexOf(" ") >= 0) {
        return `"${arg}"`
    }
    return sarg;
}

// cmd options are passed with preceeding 2 dahses EX: --help
export function ParseOptions(): AppOptions {
    // Initialize with defaults
    const options: AppOptions = {
        sourcePath: "",
        useCuda: false,
        allowFileExtensions: DEFAULT_APPROVED_FILE_EXTENSIONS,
        targetContainerFormat: "copy",
        targetAudioEncoder: "copy",
        targetVideoEncoder: "copy",
        savePath: "./video-converter-output",
        saveInPlace: false,
        copyRelativeFolderPath: false,
        getInfo: false,
        convertVideo: false,
        xArgs: [],
        help: false,
    };
    // FIXME: this may need to be change so that it does not hard code the 2. If this app is npm installed I think that will be wrong.
    for (let i = 2; i < argv.length; i++) {
        const currentArg = argv[i].substring(2);
        switch (currentArg) {
            case HELP_OPTION_NAME:
                options[HELP_OPTION_NAME] = true;
                break;
            case X_ARGS_OPTION_NAME:
                // eslint-disable-next-line no-case-declarations
                const xargs = JSON.parse(argv[++i]);
                if (Array.isArray(xargs)) {
                    const args = xargs.map((x) => safeQuoteXArg(x));
                    options[X_ARGS_OPTION_NAME].push(...args);
                } else {
                    options[X_ARGS_OPTION_NAME].push(safeQuoteXArg(xargs as string));
                }
                break;
            case SOURCE_PATH_OPTION_NAME:
                options[SOURCE_PATH_OPTION_NAME] = argv[++i];
                break;
            case USE_CUDA_OPTION_NAME:
                options[USE_CUDA_OPTION_NAME] = true;
                break;
            case ALLOWED_FILE_EXTENSIONS_OPTION_NAME:
                // eslint-disable-next-line no-case-declarations
                const extension = argv[++i] ?? "";
                if (extension.length > 0) {
                    options[ALLOWED_FILE_EXTENSIONS_OPTION_NAME] = extension.split(",").map((s) => s.toLowerCase())
                } else {
                    stdout.write(`${ALLOWED_FILE_EXTENSIONS_OPTION_NAME} cannot be empty: ${extension}${EOL}`);
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
            case TARGET_FILE_NAME_REGEX_OPTION_NAME:
                // FIXME: for now all regex provided will be case insensitive...
                options[TARGET_FILE_NAME_REGEX_OPTION_NAME] = new RegExp(argv[++i], "i");
                break;
            case SAVE_PATH_OPTION_NAME:
                options[SAVE_PATH_OPTION_NAME] = argv[++i] ?? "";
                break;
            case SAVE_IN_PLACE:
                options[SAVE_IN_PLACE] = true;
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
            default:
                // If we get here we did somthing wrong... print help and return?
                // FIXME: abstract how this is output?
                stdout.write(`invalid arg provided: ${argv[i]}${EOL}`);
                return {
                    ...options,
                    help: true, // force help to true so help text also prints...
                };
                break;
        }

    }
    return options;
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
                name: USE_CUDA_OPTION_NAME,
                description: "A flag. When provided will add flags to FFMPEG to support hardware accelerated encoders.",
            },
            {
                name: ALLOWED_FILE_EXTENSIONS_OPTION_NAME,
                description: "A comma seperated list of file extensions to use when assessing if a video should be transcoded. (Case Insensitive)",
            },
            {
                name: TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME,
                description: "The video container format that the transcoded video will be saved in. If not provided the video container format will not be changed.",
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
                description: "a regular expression that will be applied to each file in the source path. When a match occurrs the file will be processed. (Case Insensitive)",
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
                name: SAVE_IN_PLACE,
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