import { outdent } from 'outdent';
import { BreakCallback, BreakReason } from '../break';
import { Bus } from '../bus';
import { Clock } from '../clock';
import { dispatcher } from './globals';
import { flagsToString, Mode, SlowPathReason, State } from './state';
import { hex16, hex8 } from '../util';

export class Cpu {
    constructor(private bus: Bus, private clock: Clock) {}

    reset(): BreakReason {
        this.state.a = 0;
        this.state.x = 0;
        this.state.y = 0;
        this.state.s = 0x0100;
        this.state.d = 0;
        this.state.k = 0;
        this.state.dbr = 0;
        this.state.p = 0;
        this.state.slowPath = 0;
        this.state.mode = Mode.em;

        this.clearBreak();

        this.state.pc = this.bus.read(0xfffc, this.breakCb);
        this.state.pc |= this.bus.read(0xfffd, this.breakCb) << 8;

        return this.state.breakReason;
    }

    run(instructionLimit: number): number {
        return dispatcher(instructionLimit, this.state, this.bus, this.clock, this.breakCb);
    }

    getBreakMessage(): string {
        return this.breakMessage;
    }

    describeState(): string {
        // prettier-ignore
        return outdent`
            A: ${hex16(this.state.a)}    X: ${hex16(this.state.x)}    Y: ${hex16(this.state.y)}    S: ${hex16(this.state.s)}    PC: ${hex16(this.state.pc)}
            K: ${hex8(this.state.k >> 16)}      D: ${hex8(this.state.d >> 16)}      DBR: ${hex8(this.state.dbr)}    flags: ${flagsToString(this.state.p)}${(this.state.mode === Mode.em) ? ' (e)' : ''}
        `;
    }

    readonly state: State = {
        a: 0,
        x: 0,
        y: 0,
        pc: 0,
        s: 0x0100,
        d: 0,
        k: 0,
        dbr: 0,
        p: 0,
        slowPath: 0,
        mode: Mode.em,
        breakReason: BreakReason.none,
    };

    private clearBreak(): void {
        this.state.breakReason = BreakReason.none;
    }

    private breakCb: BreakCallback = (reason, message) => {
        if (this.state.breakReason) return;

        this.state.breakReason = reason;
        this.breakMessage = message;

        this.state.slowPath |= SlowPathReason.break;
    };

    private breakMessage = '';
}
