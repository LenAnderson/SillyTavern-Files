import { Router } from 'express';
import { jsonParser } from '../../src/express-common.js';
import { createRequire } from 'module';
import { delay, uuidv4 } from '../../src/util.js';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
const require  = createRequire(import.meta.url);
const path = require('path');
const mime = require('mime-types');
const sanitize = require('sanitize-filename');
const fs = require('fs');
const jimp = require('jimp');
const writeFileAtomicSync = require('write-file-atomic').sync;
const open = require('open');


class Watcher {
	/**@type {number} */ lastRequestedOn = -1;
	/**@type {string} */ filePath;
	/**@type {import('express').Response[]} */ responseList = [];
}
/**@type {Watcher[]} */
const watchList = [];

const unwatchFile = async(filePath)=>{
	console.log('[FILES]', 'unwatchFile', filePath);
	let w = /**@type {Watcher} */(watchList.find(it=>it.filePath == filePath));
	if (!w) return;
	watchList.splice(watchList.indexOf(w), 1);
	while (w.responseList.length > 0) {
		w.responseList.pop()?.sendFile(w.filePath);
	}
};
const watchFile = async(filePath, response, interval = 500)=>{
	console.log('[FILES]', 'watchFile', filePath);
	let w = /**@type {Watcher} */(watchList.find(it=>it.filePath == filePath));
	if (!w) {
		console.log('[FILES]', 'watchFile', 'new watcher', filePath);
		w = new Watcher();
		w.filePath = filePath;
		w.lastRequestedOn = new Date().getTime();
		w.responseList.push(response);
		watchList.push(w);
		fs.watchFile(w.filePath, { interval }, (curr, prev)=>{
			if (curr.mtimeMs > prev.mtimeMs) {
				console.log('[FILES]', 'watchFile', 'CHANGE', filePath);
				while (w.responseList.length > 0) {
					w.responseList.pop()?.sendFile(w.filePath);
				}
				w.lastRequestedOn = new Date().getTime();
			}
		});
		while (w.responseList.length > 0 || w.lastRequestedOn + 2000 > new Date().getTime()) {
			await delay(200);
		}
		console.log('[FILES]', 'watchFile', 'unwatching', filePath);
		fs.unwatchFile(w.filePath);
	} else {
		console.log('[FILES]', 'watchFile', 'old watcher', filePath);
		w.lastRequestedOn = new Date().getTime();
		w.responseList.push(response);
	}

};



/**
 *
 * @param {Router} router
 */
export async function init(router) {
	router.get('/', jsonParser, (req, res)=>{
		res.send('nothing to see here');
	});

	router.post('/list', jsonParser, (req, res)=>{
		let requestedPath = req.body.path ?? '/';
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const dirPath = path.join(...parts);
		let items = fs.readdirSync(dirPath).map(item=>{
			const lstat = fs.lstatSync(path.join(dirPath, item));
			const stat = fs.statSync(path.join(dirPath, item));
			return {
				path: item,
				type: lstat.isDirectory() ? 'dir' : 'file',
				fileType: lstat.isDirectory() ? null : (mime.lookup(path.join(dirPath, item)) || null)?.split('/')?.[0],
				fileTypeFull: lstat.isDirectory() ? null : (mime.lookup(path.join(dirPath, item)) || null),
				modified: lstat.mtimeMs,
				size: stat.size,
			}
		});
		if (req.body.extensions && req.body.extensions.length > 0) {
			const extList = req.body.extensions.map(it=>it.toLowerCase());
			items = items.filter(item=>{
				if (item.type != 'file') return true;
				const ext = item.path.split('.').slice(-1)[0].toLowerCase();
				return extList.includes(ext);
			});
		}
		if (req.body.types && req.body.types.length > 0) {
			const typeList = req.body.types.map(it=>it.toLowerCase());
			items = items.filter(item=>{
				if (item.type != 'file') return true;
				return typeList.includes(item.fileType?.toLowerCase()) || typeList.includes(item.fileTypeFull?.toLowerCase());
			});
		}
		items.sort((a,b)=>b.modified - a.modified);
		return res.send(items);
	});

	router.post('/get', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.resolve(path.join(...parts));
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			return res.sendFile(filePath);
		}
		return res.sendStatus(404);
	});

	router.post('/get/last-line', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.resolve(path.join(...parts));
		const stat = fs.statSync(filePath);
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			return res.send(JSON.parse(fs.readFileSync(filePath, 'utf-8').split('\n').slice(-1)[0]));
		}
		return res.sendStatus(404);
	});

	router.get('/thumb', async(req, res)=>{
		let requestedPath = req.query.path?.toString() ?? '';
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const __dirname = fileURLToPath(path.dirname(import.meta.url));
		const filePath = path.resolve(path.join(...parts));
		const fileName = parts.slice(-1)[0];
		const dbPath = path.resolve(__dirname, 'thumbs.json');
		const thumbPath = path.resolve(__dirname, 'thumbs');
		try {
			// create db file is missing
			if (!fs.existsSync(dbPath)) {
				fs.writeFileSync(dbPath, '{}');
			}
			// create thumb directory if missing
			if (!fs.existsSync(thumbPath)) {
				fs.mkdirSync(thumbPath);
			}

			// check lookup for id
			const thumbs = JSON.parse(fs.readFileSync(dbPath));
			let id = thumbs[filePath];
			if (!id) {
				id = uuidv4();
				thumbs[filePath] = id;
				fs.writeFileSync(dbPath, JSON.stringify(thumbs));
			}

			const sizes = [100, 200, 300, 500, 800];
			const reqW = sizes.find(it=>it >= Number(req.query.w)) ?? sizes.slice(-1)[0];
			const reqH = sizes.find(it=>it >= Number(req.query.h)) ?? sizes.slice(-1)[0];
			const thumbName = `${id}.${reqW}.${reqH}.png`;

			if (req.query.force || !fs.existsSync(path.join(thumbPath, thumbName))) {
				const image = await jimp.read(filePath);
				const aspect = image.getWidth() / image.getHeight();
				const reqAspect = reqW / reqH;
				let w = reqW;
				let h = reqH;
				if (aspect > reqAspect) {
					h = reqW / aspect;
				} else if (aspect < reqAspect) {
					w = reqH * aspect;
				}
				console.log('[FILES/thumb]', { aspect, reqAspect, reqW, reqH, w, h});
				const buffer = await image.cover(w, h).quality(95).getBufferAsync('image/png');
				writeFileAtomicSync(path.join(thumbPath, thumbName), buffer);
			}

			return res.sendFile(path.join(thumbPath, thumbName));
		} catch (ex) {
			console.log('[FILES/thumb]', 'ERROR', { path:req.query.path, dbPath, thumbPath, filePath }, ex);
			return res.sendFile(filePath);
		}
	});

	router.post('/put', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.join(...parts);
		const fileDir = path.join(...parts.slice(0, -1));
		let fileName = parts.slice(-1)[0];
		const namePart = fileName.split('.').slice(0, -1).join('.');
		const extPart = fileName.split('.').pop();
		console.log('[FILES/put]', { path:req.body.path, dir:fileDir, name:fileName});
		try {
			fs.mkdirSync(fileDir, { recursive:true });
			if (!req.body.overwrite && fs.existsSync(path.join(fileDir, fileName))) {
				let num = 1;
				fileName = `${namePart}_${num}.${extPart}`;
				while (fs.existsSync(path.join(fileDir, fileName))) {
					num++;
					fileName = `${namePart}_${num}.${extPart}`;
					console.log('[FILES/put]', { path:req.body.path, dir:fileDir, name:fileName});
				}
			}
			console.log('[FILES/put]', 'final name', { path:req.body.path, dir:fileDir, name:fileName});
			const data = req.body.file.split(',').slice(1).join(',');
			console.log('[FILES/put]', 'grabbed data -> buffer', { path:req.body.path, dir:fileDir, name:fileName});
			const buffer = Buffer.from(data, 'base64');
			console.log('[FILES/put]', 'WRITING', { path:req.body.path, dir:fileDir, name:fileName});
			fs.writeFileSync(path.join(fileDir, fileName), buffer);
			console.log('[FILES/put]', 'DONE', { path:req.body.path, dir:fileDir, name:fileName});
			return res.send({ name: fileName });
		} catch(ex) {
			console.log('[FILES/put]', 'ERROR', { path:req.body.path, dir:fileDir, name:fileName}, ex);
			return res.sendStatus(500);
		}

	});

	router.post('/rename', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const dirPath = path.join(...parts.slice(0, -1));
		const oldPath = path.join(...parts);
		const newPath = path.join(dirPath, req.body.newName);
		if (fs.existsSync(oldPath) && fs.lstatSync(oldPath).isFile() && !fs.existsSync(newPath)) {
			try {
				fs.renameSync(oldPath, newPath);
				return res.send(true);
			} catch (ex) {
				console.log('[FILES/rename]', 'ERROR', { path:req.body.path, oldPath, newPath}, ex);
				return res.sendStatus(500);
			}
		}
		return res.send(false);
	});

	router.post('/delete', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const oldPath = path.join(...parts);
		if (fs.existsSync(oldPath) && fs.lstatSync(oldPath).isFile()) {
			try {
				fs.unlinkSync(oldPath);
				return res.send(true);
			} catch (ex) {
				console.log('[FILES/delete]', 'ERROR', { path:req.body.path, oldPath }, ex);
				return res.sendStatus(500);
			}
		}
		return res.send(false);
	});

	router.post('/reveal', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.resolve(path.join(...parts));
		let dirPath = filePath;
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			dirPath = path.dirname(filePath);
		}
		if (fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory()) {
			open(dirPath);
			return res.send(true);
		}
		return res.sendStatus(500);
	});

	router.post('/open', jsonParser, async(req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.resolve(path.join(...parts));
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			open(filePath);
			return res.send(true);
		}
		return res.sendStatus(500);
	});

	router.post('/watch', jsonParser, async(req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.resolve(path.join(...parts));
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			await watchFile(filePath, res, req.body.interval ?? 500);
		}
		return res.sendStatus(404);
	});

	router.post('/unwatch', jsonParser, async(req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.resolve(path.join(...parts));
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			await unwatchFile(filePath);
			return res.send(true);
		}
		return res.sendStatus(404);
	});

	router.post('/exists', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.resolve(path.join(...parts));
		return res.send(fs.existsSync(filePath));
	});
}

export async function exit() {}

const module = {
    init,
    exit,
    info: {
        id: 'files',
        name: 'Files',
        description: '...',
    },
};
export default module;
