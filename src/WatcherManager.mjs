/**@typedef {import("express").Response} Response */
/**@typedef {import("node:fs").FSWatcher} FSWatcher */

import { watch, watchFile } from "node:fs";
import { EventStream } from "./EventStream.mjs";
import { log } from "./console.mjs";
import { Watcher } from "./Watcher.mjs";


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




	/**
	 *
	 * @param {string} userHandle
	 * @param {string} filePath
	 * @param {number} interval
	 * @param {Response} res
	 */
	start(userHandle, filePath, res, interval) {
		log('[wm]', 'start', userHandle, filePath);
		let w = this.watcherList.find(it=>it.filePath == filePath && it.interval == interval);
		if (!w) {
			w = new Watcher(filePath, interval);
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
		w.add(new EventStream(userHandle, res));
	}

	stopAll() {
		log('[wm]', 'stopAll');
		for (const w of this.watcherList) {
			w.stop();
		}
	}
}
