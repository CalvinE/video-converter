import { VideoContainerFormat, AudioEncoder, VideoEncoder, INVALID } from './VideoConverter/models';
import { argv, stdout } from "process";
import { EOL } from 'os';

const SOURCE_PATH_OPTION_NAME = "sourcePath";
const TARGET_ROOT_PATH_OPTION_NAME = "targetRootPath";
const TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME = "targetContainerFormat";
const TARGET_AUDIO_ENCODER_PATH_OPTION_NAME = "targetAudioEncoder";
const TARGET_VIDEO_ENCODER_PATH_OPTION_NAME = "targetVideoEncoder";
const GET_INFO_OPTION_NAME = "getInfo";
const CONVERT_VIDEO_OPTION_NAME = "convertVideo"
const HELP_OPTION_NAME = "help";

export type AppOptions = {
    [SOURCE_PATH_OPTION_NAME]: string;
    [TARGET_ROOT_PATH_OPTION_NAME]: string;
    [TARGET_CONTAINER_FORMAT_PATH_OPTION_NAME]: VideoContainerFormat;
    [TARGET_AUDIO_ENCODER_PATH_OPTION_NAME]: AudioEncoder;
    [TARGET_VIDEO_ENCODER_PATH_OPTION_NAME]: VideoEncoder;
    [GET_INFO_OPTION_NAME]: boolean;
    [CONVERT_VIDEO_OPTION_NAME]: boolean;
    [HELP_OPTION_NAME]: boolean;
}

// cmd options are passed with preceeding 2 dahses EX: --help
export function ParseOptions(): AppOptions {
    // Initialize with defaults
    const options: AppOptions = {
        sourcePath: "",
        targetRootPath: "",
        targetContainerFormat: "copy",
        targetAudioEncoder: "copy",
        targetVideoEncoder: "copy",
        getInfo: false,
        convertVideo: false,
        help: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const currentArg = argv[i].substring(2);
        switch (currentArg) {
            case HELP_OPTION_NAME:
                options[HELP_OPTION_NAME] = true;
                break;
            case SOURCE_PATH_OPTION_NAME:
                options[SOURCE_PATH_OPTION_NAME] = argv[++i] ?? "";
                break;
            case TARGET_ROOT_PATH_OPTION_NAME:
                options[TARGET_ROOT_PATH_OPTION_NAME] = argv[++i] ?? "";
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
            case GET_INFO_OPTION_NAME:
                options[GET_INFO_OPTION_NAME] = true;
                options[SOURCE_PATH_OPTION_NAME] = argv[++i];
                break;
            case CONVERT_VIDEO_OPTION_NAME:
                options[CONVERT_VIDEO_OPTION_NAME] = true;
                options[SOURCE_PATH_OPTION_NAME] = argv[++i];
                break;
            default:
                // If we get here we did somthing wrong... print help and return?
                // FIXME: abstract how this is output?
                stdout.write(`invalid arg provided: ${argv[i]}${EOL}`)
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
    stdout.write(`Please wait for assistance... PSYCHE I did not implement this yet..${EOL}`)
}