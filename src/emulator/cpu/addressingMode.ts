export const enum AddressingMode {
    abs = 'abs', // $0000
    abs_x = 'abs_x', // $0000,X
    abs_y = 'abs_y', // $0000,Y
    abs_16 = 'abs_16', // ($0000)
    abs_24 = 'abs_24', // [$0000]
    abs_x_16 = 'abs_x_16', //  ($0000,X)
    direct = 'direct', // $00
    direct_x = 'direct_x', // $00,X
    direct_y = 'direct_y', // $00,Y
    direct_16 = 'direct_16', // ($00)
    direct_24 = 'direct_24', // [$00]
    direct_x_16 = 'direct_x_16', // ($00,X)
    direct_y_16 = 'direct_y_16', // ($00),Y
    direct_y_24 = 'direct_y_24', // [$00],Y
    imm = 'imm', // #$00
    implied = 'implied',
    long = 'long', // $000000
    long_x = 'long_x', // $000000,X
    rel8 = 'rel8', // $00 (8 bit PC-relative)
    rel16 = 'rel16', // $0000 (16 bit PC-relative)
    src_dest = 'src_dest', // $00,$00
    stack = 'stack', // $00,S
    stack_y = 'stack_y', // ($00,S),Y
}
