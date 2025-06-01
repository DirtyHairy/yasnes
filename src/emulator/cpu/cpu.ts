import { BreakCallback, BreakReason } from '../break';
import { Bus } from '../bus';
import { Clock } from '../clock';
import { dispatch } from './globals';
import { copyState, INITIAL_STATE, SlowPathReason, State, stateToString } from './state';

export class Cpu {
    readonly state: State = { ...INITIAL_STATE };
    private breakMessage = '';

    constructor(
        private bus: Bus,
        private clock: Clock,
    ) {}

    reset(): BreakReason {
        copyState(this.state, INITIAL_STATE);

        this.clearBreak();

        this.state.pc = this.bus.read(0xfffc, this.breakCb);
        this.state.pc |= this.bus.read(0xfffd, this.breakCb) << 8;

        return this.state.breakReason;
    }

    run(instructionLimit: number): number {
        return dispatch(instructionLimit, this.state, this.bus, this.clock, this.breakCb);
    }

    getBreakMessage(): string {
        return this.breakMessage;
    }

    describeState(): string {
        return stateToString(this.state);
    }

    private clearBreak(): void {
        this.state.breakReason = BreakReason.none;
    }

    private breakCb: BreakCallback = (reason, message) => {
        if (this.state.breakReason) return;

        this.state.breakReason = reason;
        this.breakMessage = message;

        this.state.slowPath |= SlowPathReason.break;
    };
}
