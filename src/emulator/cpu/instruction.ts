import { Bus } from '../bus';
import { Flag, Mode, State } from './state';
import { Clock } from '../clock';
import { BreakCallback, BreakReason } from '../break';
import indentString from 'indent-string';
import { outdent } from 'outdent';
import { hex8 } from '../util';

const instructions = new Array<Instruction>(0x500);

export const enum CompilationFlags {
    none = 0,
}

export interface Instruction {
    disassemble(address: number, bus: Bus): [string, number];
    compile(flags: number): string;

    execute(state: State, bus: Bus, clock: Clock, breakCb: BreakCallback, flags?: number): void;
}

export function getInstruction(opcode: number, mode: Mode): Instruction {
    return instructions[(mode as number) | opcode];
}

export function registerInstruction(opcode: number, gen: (mode: Mode) => Instruction): void {
    for (let i = 0; i <= 4; i++) instructions[(i << 8) | opcode] = gen((i << 8) as Mode);
}

type ExecFn = (state: State, bus: Bus, clock: Clock, breakCb: BreakCallback) => void;

export const enum AddressingMode {
    abs,
    abs_x,
    abs_y,
    abs_16,
    abs_24,
    abs_x_16,
    acc,
    direct,
    direct_x,
    direct_y,
    direct_16,
    direct_24,
    direct_x_16,
    direct_x_24,
    imm,
    implied,
    long_x,
    rel8,
    rel16,
    src_dest,
    stack,
    stack_y,
}

class CodeBuilder {
    constructor(private flags: number) {}

    then(chunk: string): CodeBuilder {
        this.chunks.push(chunk);

        return this;
    }

    build(): string {
        return outdent`
        (state, bus, clock, breakCb) => {
        ${indentString(this.chunks.join('\n'), 4)}
        }
        `;
    }

    chunks: Array<string> = [];
}

class InstructionBase implements Instruction {
    constructor(private opcode: number) {}

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    disassemble(address: number, bus: Bus): [string, number] {
        return [`not implemented: ${this.opcode}`, 0];
    }

    compile(flags: number): string {
        const builder = new CodeBuilder(flags);

        this.build(builder);

        return builder.build();
    }

    execute(state: State, bus: Bus, clock: Clock, breakCb: BreakCallback, flags = CompilationFlags.none): void {
        (eval(this.compile(flags)) as ExecFn)(state, bus, clock, breakCb);
    }

    protected build(builder: CodeBuilder): void {
        builder.then(`breakCb(${BreakReason.instructionFault}, 'instruction ${hex8(this.opcode)} not implemented');`);
    }
}

class InstructionSEI extends InstructionBase {
    disassemble(): [string, number] {
        return ['SEI', 0];
    }

    protected build(builder: CodeBuilder): CodeBuilder {
        return builder.then(`state.p |= ${Flag.i};`);
    }
}

export function registerInstructions(): void {
    for (let i = 0; i < 0x500; i++) {
        registerInstruction(i & 0xff, () => new InstructionBase(i & 0xff));
    }

    registerInstruction(0x78, () => new InstructionSEI(0x78));
}
