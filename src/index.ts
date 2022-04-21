import { AppOptions, ParseOptions, PrintHelp } from './OptionsParser';


(function() {
    const appOptions: Partial<AppOptions> = ParseOptions();
    if (appOptions.help === true) {
        // print help and return...
        PrintHelp();
        return;
    }
    // run the app?
})()