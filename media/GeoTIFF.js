// @ts-check

// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	/**
	 * @param {Uint8Array} initialContent 
	 * @return {Promise<HTMLImageElement>}
	 */
	async function loadImageFromData(initialContent) {
		const blob = new Blob([initialContent], { 'type': 'image/png' });
		const url = URL.createObjectURL(blob);
		try {
			const img = document.createElement('img');
			img.crossOrigin = 'anonymous';
			img.src = url;
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
			});
			return img;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	class GeoTIFFEditor {

		constructor( /** @type {HTMLElement} */ parent) {
			this.ready = false;
			this.drawingColor = 'black';
			this._initElements(parent);
		}

		_initElements(/** @type {HTMLElement} */ parent) {

			this.wrapper = document.createElement('div');
			parent.append(this.wrapper);

			this.posx = 0.0
			this.posy = 0.0
			this.zoom = 1.0
			this.held = false

			const getTransform = (editor) => {
				return "scaleX("+editor.zoom+") scaleY("+editor.zoom+") translateX("+editor.posx+"px) translateY("+editor.posy+"px)";
			}

			const onScroll = (event, editor) => {
				if(event.ctrlKey){
					if(event.deltaY > 0.0){
						editor.zoom /= 1.1;
					} else if(event.deltaY < 0.0){
						editor.zoom *= 1.1;
					}
					editor.wrapper.style.transform = getTransform(editor)
					event.preventDefault()
				}
			}

			const onMouseMove = (event, editor) => {
				if(editor.held){
					editor.posx += event.movementX/editor.zoom;
					editor.posy += event.movementY/editor.zoom;
					editor.wrapper.style.transform = getTransform(editor)
				}
			}

			this.wrapper.addEventListener('mousedown', (event) => {
				this.held = true;
			})

			window.addEventListener('mouseup', (event) => {
				this.held = false;
			})

			window.addEventListener('wheel', (event) => {
				onScroll(event, this)
			})

			window.addEventListener('mousemove', (event) => {
				onMouseMove(event, this)
			})
			
			this.initialCanvas = document.createElement('canvas');
			this.initialCtx = this.initialCanvas.getContext('2d');
			this.wrapper.append(this.initialCanvas);

		}

		/**
		 * @param {Uint8Array | undefined} data
		 */
		async reset(data) {
			if (data) {
				const img = await loadImageFromData(data);
				this.initialCanvas.width = img.naturalWidth;
				this.initialCanvas.height = img.naturalHeight;
				this.initialCtx.drawImage(img, 0, 0);
				this.ready = true;
			}
		}

		async resetUntitled() {
			const size = 100;
			this.initialCanvas.width = size;
			this.initialCanvas.height = size;

			this.initialCtx.save();
			{
				this.initialCtx.fillStyle = 'white';
				this.initialCtx.fillRect(0, 0, size, size);
			}
			this.initialCtx.restore();
			this.ready = true;
		}

		/** @return {Promise<Uint8Array>} */
		async getImageData() {
			const outCanvas = document.createElement('canvas');
			outCanvas.width = this.initialCanvas.width;
			outCanvas.height = this.initialCanvas.height;

			const outCtx = outCanvas.getContext('2d');
			outCtx.drawImage(this.initialCanvas, 0, 0);

			const blob = await new Promise(resolve => {
				outCanvas.toBlob(resolve, 'image/png')
			});

			return new Uint8Array(await blob.arrayBuffer());
		}
	}

	const editor = new GeoTIFFEditor(document.querySelector('.drawing-canvas'));

	// Handle messages from the extension
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					if (body.untitled) {
						await editor.resetUntitled();
						return;
					} else {
						// Load the initial image into the canvas.
						await editor.reset(body.value);
						return;
					}
				}
			case 'update':
				{
					await editor.reset(body.content)
					return;
				}
			case 'getFileData':
				{			
					// Get the image data for the canvas and post it back to the extension.
					editor.getImageData().then(data => {
						vscode.postMessage({ type: 'response', requestId, body: Array.from(data) });
					});
					return;
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });
}());
