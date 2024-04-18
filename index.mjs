import { Router } from 'express';
import { jsonParser } from '../../src/express-common.js';
import { createRequire } from 'module';
const require  = createRequire(import.meta.url);
const path = require('path');
const sanitize = require('sanitize-filename');
const fs = require('fs');



/**
 *
 * @param {Router} router
 */
export async function init(router) {
	router.get('/', jsonParser, (req, res)=>{
		res.send('nothing to see here');
	});

	router.post('/list', jsonParser, (req, res)=>{
		let requestedPath = req.body.folder ?? '/';
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const dirPath = path.join(...parts);
		const items = fs.readdirSync(dirPath).map(item=>{
			const lstat = fs.lstatSync(path.join(dirPath, item));
			const stat = fs.statSync(path.join(dirPath, item));
			return {
				path: item,
				type: lstat.isDirectory() ? 'dir' : 'file',
				modified: lstat.mtimeMs,
				size: stat.size,
			}
		});
		items.sort((a,b)=>b.modified - a.modified);
		return res.send(items);
	});

	router.post('/get', jsonParser, (req, res)=>{
		let requestedPath = req.body.file;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.join(...parts);
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			return res.sendFile(filePath);
		}
	});

	router.post('/get/last-line', jsonParser, (req, res)=>{
		let requestedPath = req.body.file;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.join(...parts);
		const stat = fs.statSync(filePath);
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			return res.send(JSON.parse(fs.readFileSync(filePath, 'utf-8').split('\n').slice(-1)[0]));
		}
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
