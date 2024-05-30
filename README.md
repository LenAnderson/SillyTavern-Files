# SillyTavern Files Plugin

Adds an endpoint to browse, retrieve, and upload files.

```
/api/plugins/files/list/
{
	path: "/backups"
}
 -> [
		{
			"path": "chat_ann_20240418-091225.jsonl",
			"type": "file",
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
			"modified": 1713444862816.0537,
			"size": 267611
		},
		{
			"path": "Valka",
			"type": "dir",
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
 -> THUMBNAIL_IMAGE
```


```
/api/plugins/files/put
{
	path: "~/user/images/my-image.jpg",
	path: "base64-dataURI"
}
 -> FINAL_FILENAME
```

```
/api/plugins/files/rename
{
	path: "~/user/images/my-image.jpg",
	newName: "my-renamed-image.jpg"
}
 -> FINAL_FILENAME
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
