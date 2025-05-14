import { watch } from "node:fs";
import { EventStream } from "./EventStream.mjs";
import { log } from "./console.mjs";
import { delay } from "../../../src/util.js";
import EventEmitter from "node:events";
import { existsAsync } from "./fs.mjs";
import path from "node:path";

/**@typedef {{filePath:string, stream:EventStream, watcherToken:string}} WatchItem */

export class Watcher {
    /** @readonly */
    /** @enum {string} */
    static EVENT = {
        /** Stopped watching */
        STOP: 'stop',
    };




	/**@type {string} */ dirPath;

	/**@type {import("node:fs").FSWatcher} */ watcher;
	/**@type {boolean} */ isWatching = false;
	/**@type {WatchItem[]} */ streamList = [];

	/**@type {Set<string>} */ queue = new Set();
	/**@type {boolean} */ isProcessingQueue = false;

	/**@type {EventEmitter} */ eventSource =new EventEmitter();


	constructor(dirPath) {
		this.dirPath = dirPath;
	}

	async start() {
		if (this.isWatching) return;
		this.isWatching = true;
		log('[w]', 'watch', this.dirPath);
		this.watcher = watch(this.dirPath, {}, (event, filename)=>{
			if (filename === null) return;
			this.queue.add(filename);
			this.processQueue();
		});
	}

	stop() {
		log('[w]', 'stop', this.dirPath);
		this.isWatching = false;
		this.watcher?.close();
		while (this.streamList.pop());
		this.eventSource.emit(Watcher.EVENT.STOP, this);
	}


	/**
	 * @param {string} filePath
	 * @param {EventStream} stream
	 */
	async add(filePath, stream, watcherToken) {
		log('[w]', 'add', this.streamList.length, this.dirPath);
		const item = { filePath, stream, watcherToken };
		this.streamList.push(item);
		stream.eventSource.on(EventStream.EVENT.CLOSE, ()=>this.remove(item));
		this.start();
	}

	/**
	 * @param {WatchItem} item
	 */
	async remove(item) {
		log('[w]', 'remove', this.streamList.length, this.dirPath);
		const idx = this.streamList.indexOf(item);
		if (idx > -1) {
			this.streamList.splice(idx, 1);
		}
		if (!this.streamList.length) {
			this.stop();
		}
	}


	async processQueue() {
		if (this.isProcessingQueue) return;
		if (!this.queue.size) return;
		this.isProcessingQueue = true;
		await delay(500);
		while (this.queue.size) {
			const filename = [...this.queue][0];
			this.queue.delete(filename);
			const filePath = path.join(this.dirPath, filename);
			const streams = this.streamList.filter(it=>it.filePath == filePath);
			for (const item of streams) {
				const exists = await existsAsync(filePath);
				const data = { filePath, exists, watcherToken:item.watcherToken };
				log('[w]', 'update', data);
				item.stream.writeUpdate(data);
			}
		}
		this.isProcessingQueue = false;
		this.processQueue();
	}
}
