import { Bus } from '../bus';
import { Flag, Mode, State } from './state';
import { Clock } from '../clock';
import { BreakCallback, BreakReason } from '../break';
import indentString from 'indent-string';
import { outdent } from 'outdent';
import { hex8 } from '../util';

const instructions = new Array<Instruction>(0x100);

export const enum CompilationFlags {
    none = 0,
}

export interface DisassembleResult {
    disassembly: string;
    additionalBytes: number;
    mode: Mode;
}

export interface Instruction {
    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult;
    compile(mode: Mode, flags: number): string;

    execute(state: State, bus: Bus, clock: Clock, breakCb: BreakCallback, flags?: number): void;
}

export function getInstruction(opcode: number): Instruction {
    return instructions[opcode];
}

export function registerInstruction(opcode: number, instruction: Instruction): void {
    instructions[opcode] = instruction;
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
    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        return {
            disassembly: `D.B ${hex8(this.opcode)}`,
            additionalBytes: 0,
            mode,
        };
    }

    compile(mode: Mode, flags: number): string {
        const builder = new CodeBuilder(flags);

        this.build(mode, builder, flags);

        return builder.build();
    }

    execute(state: State, bus: Bus, clock: Clock, breakCb: BreakCallback, flags = CompilationFlags.none): void {
        (eval(this.compile(state.mode, flags)) as ExecFn)(state, bus, clock, breakCb);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected build(mode: Mode, builder: CodeBuilder, flags: CompilationFlags): void {
        builder.then(outdent`
            breakCb(${BreakReason.instructionFault}, 'instruction ${hex8(this.opcode)} not implemented');
        `);
    }
}

class InstructionSEI extends InstructionBase {
    disassemble(mode: Mode): DisassembleResult {
        return {
            disassembly: 'SEI',
            additionalBytes: 0,
            mode,
        };
    }

    protected build(mode: Mode, builder: CodeBuilder): CodeBuilder {
        return builder.then(outdent`
            state.p |= ${Flag.i};
            clock.tickCpu(1);
        `);
    }
}

export function registerInstructions(): void {
    for (let i = 0; i < 0x100; i++) {
        registerInstruction(i & 0xff, new InstructionBase(i));
    }

    registerInstruction(0x78, new InstructionSEI(0x78));
}
