import {
    spawn
} from 'child_process';
import {
    EventEmitter
} from 'stream';
import {
    setTimeout
} from 'timers';
import {
    ILogger
} from '../Logger/Logger';
import {
    millisecondsToHHMMSS
} from '../PrettyPrint';
import {
    CommandErroredEventData,
    CommandStateName_Errored,
    CommandFinishedEventData,
    CommandStateName_Finished,
    CommandStdOutMessageReceivedEventData,
    CommandRunningEventData,
    CommandStateName_Running,
    CommandStartedEventData,
    CommandStateName_Started,
    CommandState,
    CommandTimedoutEventData,
    CommandStateName_TimedOut,
    CommandStdErrMessageReceivedEventData,
    CommandCheckResult
} from './models';

export type CommandResult = {
    commandID: string,
    durationMilliseconds: number;
    durationPretty: string;
    error?: Error;
    exitCode?: number
    fullOutput: string[];
    fullStdErrOutput: string[];
    success: boolean;
};

class ErrorCommandTimeOutExceeded extends Error {
    static ErrorName = "CommandTimeOutExceeded";
    constructor(timeoutMilliseconds: number) {
        super(`command execution exceeded time out ${timeoutMilliseconds}ms`);
    }
}

// class ErrorCommandNotProvided extends Error {
//     static ErrorName = "CommandNotProvided";
//     constructor() {
//         super("no command was provided for CommandRunner constructor");
//     }
// }

export abstract class CommandRunner extends EventEmitter {

    protected _logger: ILogger;

    constructor(logger: ILogger) {
        super();
        this._logger = logger;
    }

    public abstract checkCommands(): Promise<CommandCheckResult>;

    protected abstract emitStarted(data: CommandStartedEventData): void;
    protected abstract emitRunning(data: CommandRunningEventData): void;
    protected abstract emitStdOutMessageReceived(data: CommandStdOutMessageReceivedEventData): void;
    protected abstract emitStdErrMessageReceived(data: CommandStdErrMessageReceivedEventData): void;
    protected abstract emitFinished(data: CommandFinishedEventData): void;
    protected abstract emitErrored(data: CommandErroredEventData): void;
    protected abstract emitTimedout(data: CommandTimedoutEventData): void;

    protected async executeCommand(command: string, args: string[], jobID: string, commandID: string, timeoutMilliseconds: number): Promise<CommandResult> {
        return new Promise((resolve) => {
            let currentState: CommandState;
            let timeoutTimer: NodeJS.Timeout;
            const commandOutput: string[] = [];
            const commandStdErrOutput: string[] = [];
            const startTimestampMilliseconds = Date.now();
            this._logger.LogVerbose("about to run command", {
                command: command,
                commandID,
                args,
            });
            const proc = spawn(command, args, {
                shell: true,
            });
            currentState = CommandStateName_Started;
            const eventData = {
                commandID,
                jobID,
                currentState,
                elapsedTimeMilliseconds: this.getElapsedTimeMilliseconds(startTimestampMilliseconds),
                elapsedTimePretty: millisecondsToHHMMSS(this.getElapsedTimeMilliseconds(startTimestampMilliseconds)),
                pid: proc.pid,
            };
            this._logger.LogDebug("starting command", eventData);
            this.emitStarted(eventData);

            proc.on('spawn', () => {
                // The process has started: https://nodejs.org/api/child_process.html#event-spawn
                currentState = CommandStateName_Running;
                const elapsedTimeMilliseconds = this.getElapsedTimeMilliseconds(startTimestampMilliseconds);
                const eventData = {
                    commandID,
                    jobID,
                    currentState,
                    elapsedTimeMilliseconds,
                    elapsedTimePretty: millisecondsToHHMMSS(elapsedTimeMilliseconds),
                    pid: proc.pid,
                };
                this._logger.LogDebug("command process spawned", eventData);
                this.emitRunning(eventData);
            });

            //TODO: apparently ffmpeg output I care about goes to stderr...
            // need to have a different handler for stderr and try to parse it?
            proc.stderr.on("data", (chunk) => {
                const currentMessage = chunk.toString();
                commandStdErrOutput.push(currentMessage);
                const elapsedTimeMilliseconds = this.getElapsedTimeMilliseconds(startTimestampMilliseconds);
                const eventData: CommandStdErrMessageReceivedEventData = {
                    commandID: commandID,
                    jobID: jobID,
                    commandMessage: currentMessage,
                    currentState,
                    elapsedTimeMilliseconds,
                    elapsedTimePretty: millisecondsToHHMMSS(elapsedTimeMilliseconds),
                    pid: proc.pid,
                };
                this._logger.LogDebug("message received from command stderr", eventData);
                this.emitStdErrMessageReceived(eventData);
            });

            proc.stdout.on("data", (chunk) => {
                const currentMessage = chunk.toString();
                commandOutput.push(currentMessage);
                const elapsedTimeMilliseconds = this.getElapsedTimeMilliseconds(startTimestampMilliseconds);
                const eventData: CommandStdOutMessageReceivedEventData = {
                    commandID: commandID,
                    jobID: jobID,
                    commandMessage: currentMessage,
                    currentState,
                    elapsedTimeMilliseconds,
                    elapsedTimePretty: millisecondsToHHMMSS(elapsedTimeMilliseconds),
                    pid: proc.pid,
                };
                this._logger.LogDebug("message received from command stdout", eventData);
                this.emitStdOutMessageReceived(eventData);
            });

            // proc.on('message', (message) => {
            //     // Output from command has been received: https://nodejs.org/api/child_process.html#event-message
            //     const currentMessage = message.toString();
            //     commandOutput.push(currentMessage);
            //     const eventData = {
            //         commandId,
            //         currentState,
            //         elapsedTimeMilliseconds: this.getElapsedTimeMilliseconds(startTimestampMilliseconds),
            //         message: currentMessage,
            //         pid: proc.pid,
            //     };
            //     this._logger.LogDebug("message received from command", eventData)
            //     this.emitMessageReceived(eventData);
            // });

            proc.on('error', (err) => {
                // An error occurred while processing the command: https://nodejs.org/api/child_process.html#event-error
                const durationMilliseconds = this.getElapsedTimeMilliseconds(startTimestampMilliseconds);
                currentState = CommandStateName_Errored;
                const eventData: CommandErroredEventData = {
                    commandID: commandID,
                    jobID: jobID,
                    currentState,
                    elapsedTimeMilliseconds: durationMilliseconds,
                    elapsedTimePretty: millisecondsToHHMMSS(durationMilliseconds),
                    error: err,
                    pid: proc.pid,
                };
                this._logger.LogError("command encountered an error", err, eventData);
                this.emitErrored(eventData);
                resolve({
                    commandID,
                    durationMilliseconds,
                    durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                    fullOutput: commandOutput,
                    fullStdErrOutput: commandStdErrOutput,
                    success: false,
                    error: err,
                });
            });

            proc.on('close', (code) => {
                // The process has ended and the stdio streams of the child process have been closed: https://nodejs.org/api/child_process.html#event-close
                if (currentState === "running") {
                    const durationMilliseconds = this.getElapsedTimeMilliseconds(startTimestampMilliseconds);
                    const currentCode = code ?? undefined;
                    currentState = CommandStateName_Finished;
                    const eventData: CommandFinishedEventData = {
                        code: currentCode,
                        commandID: commandID,
                        jobID: jobID,
                        currentState,
                        elapsedTimeMilliseconds: durationMilliseconds,
                        elapsedTimePretty: millisecondsToHHMMSS(durationMilliseconds),
                        fullOutput: commandOutput,
                        pid: proc.pid,
                    };
                    this._logger.LogDebug("command closed", eventData);
                    this.emitFinished(eventData);
                    resolve({
                        commandID,
                        durationMilliseconds,
                        durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                        fullOutput: commandOutput,
                        fullStdErrOutput: commandStdErrOutput,
                        success: code === 0,
                        exitCode: currentCode,
                    });
                }
            });

            // proc.on('exit', (code) => {
            //     // The child process has ended: https://nodejs.org/api/child_process.html#event-exit
            //     if (currentState === "running") {
            //         const durationMilliseconds = this.getElapsedTimeMilliseconds(startTimestampMilliseconds);
            //         const currentCode = code ?? undefined;
            //         currentState = CommandStateName_Finished;
            //         const eventData: CommandFinishedEventData = {
            //             code: currentCode,
            //             commandId,
            //             currentState,
            //             elapsedTimeMilliseconds: durationMilliseconds,
            //             fullOutput: commandOutput,
            //             pid: proc.pid,
            //         };
            //         this._logger.LogDebug("command exited", eventData);
            //         this.emitFinished(eventData);
            //         resolve({
            //             commandId,
            //             durationMilliseconds,
            //             fullOutput: commandOutput,
            //             success: code === 0,
            //             exitCode: currentCode,
            //         });
            //     }
            // });

            proc.on('disconnect', () => {
                // The child process has disconnected: https://nodejs.org/api/child_process.html#event-disconnect

                // if( this._currentState === "running") {
                //     this._currentState = CommandFinishedStateName;
                //     this.emitFinished({
                //         commandId,
                //         currentState: this._currentState,
                //         elapsedTimeMs: this.getElapsedTimeMilliseconds(startTimestampMilliseconds),
                //         pid: proc.pid,
                //     });
                //     // TODO: resolve with result obj.
                // }
                // FIXME: Not sure we should listen to this one?
            });

            if (timeoutMilliseconds > 0) {
                timeoutTimer = setTimeout(() => {
                    clearTimeout(timeoutTimer);
                    // emit timedout event 
                    if (currentState === "running") {
                        proc.kill("SIGKILL"); // Is this ok?
                        const durationMilliseconds = this.getElapsedTimeMilliseconds(startTimestampMilliseconds);
                        currentState = CommandStateName_TimedOut;
                        const eventData = {
                            commandID,
                            jobID,
                            currentState,
                            elapsedTimeMilliseconds: durationMilliseconds,
                            elapsedTimePretty: millisecondsToHHMMSS(durationMilliseconds),
                            pid: proc.pid,
                            timeoutMilliseconds: timeoutMilliseconds
                        };
                        const err = new ErrorCommandTimeOutExceeded(timeoutMilliseconds);
                        this._logger.LogError("command timed out", err, eventData);
                        this.emitTimedout(eventData);
                        resolve({
                            commandID,
                            durationMilliseconds,
                            durationPretty: millisecondsToHHMMSS(durationMilliseconds),
                            error: err,
                            fullOutput: commandOutput,
                            fullStdErrOutput: commandStdErrOutput,
                            success: false,
                        });
                    }
                }, timeoutMilliseconds);
            }
        });
    }

    private getElapsedTimeMilliseconds(startTimeMilliseconds: number): number {
        const now = Date.now();
        return now - startTimeMilliseconds;
    }
}