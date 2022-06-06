import { FileInfo } from '../../FileManager';
import { millisecondsToHHMMSS } from '../../PrettyPrint';
import { CheckVideoIntegrityCommandOptions, CheckVideoIntegrityCommandResult, ConvertVideoCommandResult, GetVideoInfoCommandOptions, GetVideoInfoCommandResult, IntegrityCheckResult, IVideoConverter, VideoConvertCommandOptions, VideoInfo } from './../models';


export class MockVideoConverter implements IVideoConverter {
    private _sourceVideoInfo: VideoInfo;
    private _sourceVideoIntegrityCheck: IntegrityCheckResult;
    constructor(sourceVideoInfo: VideoInfo, sourceVideoIntegrityCheck: IntegrityCheckResult) {
        this._sourceVideoInfo = sourceVideoInfo;
        this._sourceVideoIntegrityCheck = sourceVideoIntegrityCheck;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    public on(_eventName: string | symbol, _listener: (...args: any[]) => void) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    public off(_eventName: string | symbol, _listener: (...args: any[]) => void) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getVideoInfo(sourceFile: FileInfo, _jobID: string, commandID: string, _options: GetVideoInfoCommandOptions): Promise<GetVideoInfoCommandResult> {
        return Promise.resolve({
            commandID,
            durationMilliseconds: 1000,
            durationPretty: millisecondsToHHMMSS(1000),
            fileInfo: sourceFile,
            statusCode: 0,
            success: true,
            videoInfo: this._sourceVideoInfo,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public convertVideo(_sourceFile: FileInfo, _jobID: string, commandID: string, _options: VideoConvertCommandOptions): Promise<ConvertVideoCommandResult> {
        return Promise.resolve({
            commandID,
            durationMilliseconds: 2000,
            durationPretty: millisecondsToHHMMSS(2000),
            statusCode: 0,
            success: true,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public checkVideoIntegrity(sourceFile: FileInfo, _jobID: string, commandID: string, _options: CheckVideoIntegrityCommandOptions): Promise<CheckVideoIntegrityCommandResult> {
        return Promise.resolve({
            commandID,
            durationMilliseconds: 1000,
            durationPretty: millisecondsToHHMMSS(1000),
            fileInfo: sourceFile,
            integrityCheck: this._sourceVideoIntegrityCheck,
            statusCode: 0,
            videoInfo: this._sourceVideoInfo,
            success: true,
        });
    }
}
