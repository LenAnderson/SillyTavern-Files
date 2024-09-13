# SillyTavern Files Plugin

## How to install

1. Before you begin, make sure you set a config `enableServerPlugins` to `true` in the config.yaml file of SillyTavern.

2. Open a terminal in your SillyTavern directory and use an npm script:

```bash
npm run plugins:install https://github.com/LenAnderson/SillyTavern-Files
```

If that did not work, install it manually. Then run the following:

```bash
cd plugins
git clone https://github.com/LenAnderson/SillyTavern-Files
```

## Features

Adds an endpoint to deal with files.

- browse / list files
- retrieve files
- retrieve last line from text files
- retrieve image thumbnails
- upload files
- rename files
- delete files
- open folders in OS file explorer
- open files in OS default application
- watch file for changes

```
/api/plugins/files/list/
{
	path: "/backups"
}
 -> [
		{
			"path": "chat_ann_20240418-091225.jsonl",
			"type": "file",
			"fileType": null,
			"fileTypeFull": null,
			"modified": 1713445945679.7173,
			"size": 104403
		},
		...
	]
```

```
/api/plugins/files/list/
{
	path: "~/characters"
}
 -> [
		{
			"path": "Emma.png",
			"type": "file",
			"fileType": "image",
			"fileTypeFull": "image/png,
			"modified": 1713444862816.0537,
			"size": 267611
		},
		{
			"path": "Valka",
			"type": "dir",
			"fileType": null,
			"fileTypeFull": null,
			"modified": 1712975180778.4194,
			"size": 0
		},
		...
	]
```

```
/api/plugins/files/get/
{
	path: "/backups/chat_ann_20240418-091225.jsonl"
}
 -> FILE
```

```
/api/plugins/files/get/last-line
{
	path: "/backups/chat_ann_20240418-091225.jsonl"
}
 -> TEXT
```

```
/api/plugins/files/thumb?path=~&2Fuser/%2Fimages%2F/myImage.jpg&w=200&h=200&force=1
 -> THUMBNAIL_FILE
```


```
/api/plugins/files/put
{
	path: "~/user/images/my-image.jpg",
	path: "base64-dataURI"
}
 -> {
	name: "final-filename.jpg"
 }
```

```
/api/plugins/files/rename
{
	path: "~/user/images/my-image.jpg",
	newName: "my-renamed-image.jpg"
}
 -> true
```

```
/api/plugins/files/delete
{
	path: "~/user/images/my-image.jpg",
}
 -> true
```

```
/api/plugins/files/reveal
{
	path: "~/user/images",
}
 -> true
```

```
/api/plugins/files/open
{
	path: "~/user/images/my-image.jpg",
}
 -> true
```

```
/api/plugins/files/watch
{
	path: "~/user/my-file.txt",
	interval: 500
}
 -> FILE
```

```
/api/plugins/files/unwatch
{
	path: "~/user/my-file.txt"
}
 -> true
```
