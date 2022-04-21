import { spawn } from 'child_process';
import { EventEmitter } from 'stream';
import { CommandErroredEventData, CommandStateName_Errored, CommandFinishedEventData, CommandStateName_Finished, CommandMessageReceivedEventData, CommandStateName_Pending, CommandRunningEventData, CommandStateName_Running, CommandStartedEventData, CommandStateName_Started, CommandState, CommandTimedoutEventData, CommandStateName_TimedOut } from './models';

export type CommandResult = {
    commandId: string,
    durationMilliseconds: number;
    error?: Error;
    exitCode?: number
    fullOutput: string[];
    success: boolean;
};

class ErrorCommandTimeOutExceeded extends Error {
    static ErrorName = "CommandTimeOutExceeded";
    constructor(timeoutMiliseconds: number) {
        super(`command execution exceeded time out ${timeoutMiliseconds}ms`)
    }
}

export abstract class CommandRunner extends EventEmitter {
    public currentState: CommandState;

    constructor() {
        super();
        this.currentState = CommandStateName_Pending;
    }

    protected abstract emitStarted(data: CommandStartedEventData): void;
    protected abstract emitRunning(data: CommandRunningEventData): void;
    protected abstract emitMessageReceived(data: CommandMessageReceivedEventData): void;
    protected abstract emitFinished(data: CommandFinishedEventData): void;
    protected abstract emitErrored(data: CommandErroredEventData): void;
    protected abstract emitTimedout(data: CommandTimedoutEventData): void;

    protected async executeCommand(command: string, args: string[], commandId: string, timeoutMilliseconds: number): Promise<CommandResult> {
        let timeoutTimer: NodeJS.Timeout;
        return new Promise((resolve, reject) => {
            const commandOutput: string[] = [];
            const startTimestampMilliseconds = Date.now();
            const proc = spawn(command, args, {

            });
            this.currentState = CommandStateName_Started;
            this.emitStarted({
                commandId,
                currentState: this.currentState,
                elapsedTimeMilliseconds: this.getElapsedTimeMillseconds(startTimestampMilliseconds),
                pid: proc.pid,
            });

            proc.on('spawn', () => {
                // The process has started: https://nodejs.org/api/child_process.html#event-spawn
                this.currentState = CommandStateName_Running;
                this.emitRunning({
                    commandId,
                    currentState: this.currentState,
                    elapsedTimeMilliseconds: this.getElapsedTimeMillseconds(startTimestampMilliseconds),
                    pid: proc.pid,
                });
            });

            proc.on('message', (message, handle) => {
                // Output from command has been received: https://nodejs.org/api/child_process.html#event-message
                const currentMessage = message.toString();
                commandOutput.push(currentMessage);
                this.emitMessageReceived({
                    commandId,
                    currentState: this.currentState,
                    elapsedTimeMilliseconds: this.getElapsedTimeMillseconds(startTimestampMilliseconds),
                    message: currentMessage,
                    pid: proc.pid,
                });
            });

            proc.on('error', (err) => {
                // An error occurred while processing the command: https://nodejs.org/api/child_process.html#event-error
                const durationMilliseconds = this.getElapsedTimeMillseconds(startTimestampMilliseconds);
                this.currentState = CommandStateName_Errored;
                this.emitErrored({
                    commandId,
                    currentState: this.currentState,
                    elapsedTimeMilliseconds: durationMilliseconds,
                    error: err,
                    pid: proc.pid,
                });
                // TODO: resolve with result obj.
                resolve({
                    commandId,
                    durationMilliseconds,
                    fullOutput: commandOutput,
                    success: false,
                    error: err,
                });
            });

            proc.on('close', (code, signal) => {
                // The process has ended and the stdio streams of the child process have been closed: https://nodejs.org/api/child_process.html#event-close
                if (this.currentState === "running") {
                    const durationMilliseconds = this.getElapsedTimeMillseconds(startTimestampMilliseconds);
                    const currentCode = code ?? undefined;
                    this.currentState = CommandStateName_Finished;
                    this.emitFinished({
                        code: currentCode,
                        commandId,
                        currentState: this.currentState,
                        elapsedTimeMilliseconds: durationMilliseconds,
                        pid: proc.pid,
                    });
                    // TODO: resolve with result obj.
                    resolve({
                        commandId,
                        durationMilliseconds,
                        fullOutput: commandOutput,
                        success: code === 0,
                        exitCode: currentCode,
                    });
                }
            });

            proc.on('exit', (code, signal) => {
                // The child process has ended: https://nodejs.org/api/child_process.html#event-exit
                if (this.currentState === "running") {
                    const durationMilliseconds = this.getElapsedTimeMillseconds(startTimestampMilliseconds);
                    const currentCode = code ?? undefined;
                    this.currentState = CommandStateName_Finished;
                    this.emitFinished({
                        code: currentCode,
                        commandId,
                        currentState: this.currentState,
                        elapsedTimeMilliseconds: durationMilliseconds,
                        pid: proc.pid,
                    });
                    // TODO: resolve with result obj.
                    resolve({
                        commandId,
                        durationMilliseconds,
                        fullOutput: commandOutput,
                        success: code === 0,
                        exitCode: currentCode,
                    });
                }
            });

            proc.on('disconnect', () => {
                // The child process has disconnected: https://nodejs.org/api/child_process.html#event-disconnect

                // if( this._currentState === "running") {
                //     this._currentState = CommandFinishedStateName;
                //     this.emitFinished({
                //         commandId,
                //         currentState: this._currentState,
                //         elapsedTimeMs: this.getElapsedTimeMillseconds(startTimestampMilliseconds),
                //         pid: proc.pid,
                //     });
                //     // TODO: resolve with result obj.
                // }
                // FIXME: Not sure we should listen to this one?
            });

            if (timeoutMilliseconds > 0) {
                timeoutTimer = setTimeout(() => {
                    clearTimeout(timeoutTimer);
                    proc.kill("SIGKILL"); // Is this ok?
                    // emit timedout event 
                    if (this.currentState === "running") {
                        const durationMilliseconds = this.getElapsedTimeMillseconds(startTimestampMilliseconds);
                        this.currentState = CommandStateName_TimedOut;
                        this.emitTimedout({
                            commandId,
                            currentState: this.currentState,
                            elapsedTimeMilliseconds: this.getElapsedTimeMillseconds(startTimestampMilliseconds),
                            pid: proc.pid,
                            timeoutMilliseconds: timeoutMilliseconds
                        });
                        // TODO: resolve with result obj.
                        resolve({
                            commandId,
                            durationMilliseconds,
                            error: new ErrorCommandTimeOutExceeded(timeoutMilliseconds),
                            fullOutput: commandOutput,
                            success: false,
                        });
                    }
                }, timeoutMilliseconds)
            }
        });
    }

    private getElapsedTimeMillseconds(startTimeMilliseconds: number): number {
        const now = Date.now();
        return now - startTimeMilliseconds;
    }
}