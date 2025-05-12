import { unwatchFile, watchFile } from "node:fs";
import { EventStream } from "./EventStream.mjs";
import { log } from "./console.mjs";
import { delay } from "../../../src/util.js";
import EventEmitter from "node:events";

export class Watcher {
    /** @readonly */
    /** @enum {string} */
    static EVENT = {
        /** Stopped watching */
        STOP: 'stop',
    };




	/**@type {string} */ filePath;
	/**@type {number} */ interval;

	/**@type {boolean} */ isWatching = false;
	/**@type {EventStream[]} */ streamList = [];

	/**@type {EventEmitter} */ eventSource =new EventEmitter();


	constructor(filePath, interval) {
		this.filePath = filePath;
		this.interval = interval;
	}

	async start() {
		if (this.isWatching) return;
		this.isWatching = true;
		log('[w]', 'watch', this.filePath);
		const listener = (curr, prev)=>{
			if (curr.mtimeMs > prev.mtimeMs) {
				log('[w]', 'CHANGE', this.filePath);
				for (const stream of this.streamList) {
					stream.writeUpdate({ path:this.filePath });
				}
			}
		};
		watchFile(this.filePath, { interval: this.interval }, listener);
		while (this.streamList.length > 0) {
			await delay(200);
		}
		unwatchFile(this.filePath, listener);
		this.isWatching = false;
		this.eventSource.emit(Watcher.EVENT.STOP, this);
		log('[w]', 'unwatch', this.filePath);
	}

	stop() {
		log('[w]', 'stop', this.filePath);
		while (this.streamList.pop());
	}


	/**
	 * @param {EventStream} stream
	 */
	async add(stream) {
		log('[w]', 'add', this.streamList.length, this.filePath);
		this.streamList.push(stream);
		stream.eventSource.on(EventStream.EVENT.CLOSE, ()=>this.remove(stream));
		this.start();
	}

	/**
	 * @param {EventStream} stream
	 */
	async remove(stream) {
		log('[w]', 'remove', this.streamList.length, this.filePath);
		const idx = this.streamList.indexOf(stream);
		if (idx > -1) {
			this.streamList.splice(idx, 1);
		}
	}
}
