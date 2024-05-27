# SillyTavern Files Plugin

Adds an endpoint to browse, retrieve, and upload files.

```
/api/plugins/files/list/
{
	folder: "/backups"
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
	folder: "~/characters"
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
	file: "/backups/chat_ann_20240418-091225.jsonl"
}
 -> FILE
```

```
/api/plugins/files/get/last-line
{
	file: "/backups/chat_ann_20240418-091225.jsonl"
}
 -> TEXT
```


```
/api/plugins/files/put
{
	path: "~/user/images/my-image.jpg",
	file: "base64-dataURI"
}
 -> FINAL_FILENAME
```
