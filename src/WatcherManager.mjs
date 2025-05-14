/**@typedef {import("express").Response} Response */
/**@typedef {import("node:fs").FSWatcher} FSWatcher */

import { EventStream } from "./EventStream.mjs";
import { log } from "./console.mjs";
import { Watcher } from "./Watcher.mjs";
import path from "node:path";
import { uuidv4 } from "../../../src/util.js";


export class WatcherManager {
	/**@type {WatcherManager} */ static #instance;
	static get instance() {
		if (!this.#instance) {
			this.#instance = new WatcherManager();
		}
		return this.#instance;
	}




	/**@type {Watcher[]} */
	watcherList = [];
	/**@type {{[token:string]:EventStream}} */
	streams = {};




	/**
	 *
	 * @param {string} userHandle
	 * @param {string} filePath
	 * @param {string} [streamToken]
	 * @param {Response} res
	 */
	start(userHandle, filePath, res, streamToken = undefined) {
		log('[wm]', 'start', userHandle, streamToken, filePath);
		const watcherToken = uuidv4();
		const dirPath = path.parse(filePath).dir;
		let w = this.watcherList.find(it=>it.dirPath == dirPath);
		if (!w) {
			w = new Watcher(dirPath);
			w.eventSource.on(Watcher.EVENT.STOP, ()=>{
				if (w) {
					const idx = this.watcherList.indexOf(w);
					if (idx > -1) {
						this.watcherList.splice(idx, 1);
					}
				}
			});
			this.watcherList.push(w);
		}
		/**@type {EventStream} */
		let stream;
		if (streamToken) {
			if (this.streams[streamToken]) {
				stream = this.streams[streamToken];
			} else {
				throw new Error('invalid token');
			}
		} else {
			stream = new EventStream(userHandle, res);
			stream.writeWatcherToken(watcherToken);
			this.streams[stream.token] = stream;
		}
		w.add(filePath, stream, watcherToken);
		return watcherToken;
	}

	stop(watcherToken) {
		const w = this.watcherList.find(w=>w.streamList.some(s=>s.watcherToken == watcherToken));
		if (w) {
			const item = w.streamList.find(s=>s.watcherToken == watcherToken);
			if (item) {
				w.remove(item);
			}
		}
	}

	stopAll() {
		log('[wm]', 'stopAll');
		for (const w of this.watcherList) {
			w.stop();
		}
	}
}
