import { argv, stdout } from "process";
import { EOL } from 'os';

const SOURCE_PATH_OPTION_NAME = "sourcePath";
const HELP_OPTION_NAME = "help";

export type AppOptions = {
    [SOURCE_PATH_OPTION_NAME]: string
    [HELP_OPTION_NAME]: boolean
}

export function ParseOptions(): Partial<AppOptions> {
    const options: Partial<AppOptions> = {};
    for (let i = 2; i < argv.length; i++) {
        const currentArg = argv[i].substring(2);
        switch (currentArg) {
            case HELP_OPTION_NAME:
                options[HELP_OPTION_NAME] = true;
                break;
            case SOURCE_PATH_OPTION_NAME:
                options[SOURCE_PATH_OPTION_NAME] = argv[++i];
                break;
            default:
                // If we get here we did somthing wrong... print help and return?
                stdout.write(`invalid arg provided: ${argv[i]}${EOL}`)
                return {
                    help: true,
                };
                break;
        }

    }
    return options;
}

export function PrintHelp() {
    // TODO: Write this and make some data in here to keep track of the info for the help data...
    stdout.write(`Please wait for assistance...${EOL}`)
}