import { Database } from './database';
import { Rom } from './model';

export class Storage {
    getRom(): Promise<Rom | undefined> {
        return this.db.kvs.get('rom').then((item) => item?.value);
    }

    async putRom(rom: Rom): Promise<void> {
        await this.db.kvs.put({ key: 'rom', value: rom });
    }

    async removeRom(): Promise<void> {
        await this.db.kvs.delete('rom');
    }

    private db = new Database();
}
