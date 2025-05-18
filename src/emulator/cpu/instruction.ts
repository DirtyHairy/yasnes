import { Bus } from '../bus';
import { Flag, Mode, State } from './state';
import { Clock } from '../clock';
import { BreakCallback, BreakReason } from '../break';
import { outdent } from 'outdent';
import { hex16, hex8 } from '../util';
import { CodeBuilder } from './codeBuilder';

const instructions = new Array<Instruction>(0x100);

export const enum CompilationFlags {
    none = 0,
}

export const enum AddressingMode {
    abs = 'abs',
    abs_x = 'abs_x',
    abs_y = 'abs_y',
    abs_16 = 'abs_16',
    abs_24 = 'abs_24',
    abs_x_16 = 'abs_x_16',
    acc = 'acc',
    direct = 'direct',
    direct_x = 'direct_x',
    direct_y = 'direct_y',
    direct_16 = 'direct_16',
    direct_24 = 'direct_24',
    direct_x_16 = 'direct_x_16',
    direct_x_24 = 'direct_x_24',
    imm = 'imm',
    implied = 'implied',
    long_x = 'long_x',
    rel8 = 'rel8',
    rel16 = 'rel16',
    src_dest = 'src_dest',
    stack = 'stack',
    stack_y = 'stack_y',
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

class InstructionBase implements Instruction {
    constructor(protected opcode: number) {}

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

    protected disassembleWithAddressingMode(
        mnemnonic: string,
        address: number,
        addressingMode: AddressingMode,
        mode: Mode,
        bus: Bus
    ): DisassembleResult {
        switch (addressingMode) {
            case AddressingMode.abs: {
                let ptr = bus.peek(address);
                address = (address & 0xff0000) | ((address + 1) & 0xffff);

                ptr |= bus.peek(address) << 8;

                return { disassembly: `${mnemnonic} ${hex16(ptr, '$')}`, additionalBytes: 2, mode };
            }

            default:
                return { disassembly: `${mnemnonic} [addressing mode not implemented]`, additionalBytes: 0, mode };
        }
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

class InstructionSTZ extends InstructionBase {
    constructor(opcode: number, private addressingMode: AddressingMode) {
        super(opcode);
    }

    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        return this.disassembleWithAddressingMode('STZ', address, this.addressingMode, mode, bus);
    }

    protected build(mode: Mode, builder: CodeBuilder): void {
        builder.store('0', mode, this.addressingMode);
    }
}

export function registerInstructions(): void {
    for (let i = 0; i < 0x100; i++) {
        registerInstruction(i & 0xff, new InstructionBase(i));
    }

    registerInstruction(0x78, new InstructionSEI(0x78));
    registerInstruction(0x9c, new InstructionSTZ(0x9c, AddressingMode.abs));
}
