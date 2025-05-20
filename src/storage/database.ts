import { Rom } from './model';
import { Dexie } from 'dexie';

export type KVSItem = { key: 'rom'; value: Rom };
export type KVSKey = KVSItem['key'];

export class Database extends Dexie {
    kvs!: Dexie.Table<KVSItem, KVSKey>;

    constructor() {
        super('yasnes-cli');

        void this.requestPersistentStorage();

        this.version(1).stores({
            kvs: 'key',
        });
    }

    private async requestPersistentStorage(): Promise<void> {
        if (!navigator.storage?.persist || !navigator.storage?.persisted) {
            console.log('storage manager not supported; unable to request persistent storage');
        }

        try {
            if ((await navigator.storage.persisted()) || (await navigator.storage.persist())) {
                console.log('persistent storage enabled');
            } else {
                console.log('request for persistent storage denied by browser');
            }
        } catch (e) {
            console.warn(e);
            console.log('failed to request persistent storage');
        }
    }
}
