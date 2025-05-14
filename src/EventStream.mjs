/**@typedef {import("express").Response} Response */

import EventEmitter from "node:events";
import { uuidv4 } from "../../../src/util.js";


export class EventStream {
	/** @readonly */
	/** @enum {string} */
	static EVENT = {
		/** Connection has been closed */
		CLOSE: 'close',
	};




	/**@type {string} */ token;
	/**@type {string} */ userHandle;
	/**@type {Response} */ res;

	/**@type {EventEmitter} */ eventSource = new EventEmitter();


	/**
	 * @param {string} userHandle
	 * @param {Response} res
	 */
	constructor(userHandle, res) {
		this.token = uuidv4();
		this.userHandle = userHandle;
		this.res = res;

		res.on('close', ()=>this.eventSource.emit(EventStream.EVENT.CLOSE, this));

		res.writeHead(200, {
			'Content-Type': "text/event-stream",
			'Cache-Control': "no-cache",
			'Connection': "keep-alive",
			'Content-Encoding': 'none',
		});
		this.writeToken();
	}


	write(type, data) {
		this.res.write(`data: ${JSON.stringify({type, data})}\n\n`);
	}


	writeToken() {
		this.write('token', this.token);
	}
	writeWatcherToken(watcherToken) {
		this.write('watcherToken', { watcherToken });
	}

	writeUpdate(data) {
		this.write('update', data);
	}

	writeClose() {
		this.write('close', null);
		this.res.end();
	}
}
