import * as vscode from 'vscode';
import { Disposable, disposeAll } from './dispose';
import { getNonce } from './util';
import * as tiff from 'tiff'

interface GeoTIFFDocumentDelegate {
	getFileData(): Promise<Uint8Array>;
}

class GeoTIFFRaw {

	constructor(
		_documentData: Uint8Array,
		_bytes: number,
		_width: number,
		_height: number,
	){
		this._documentData = _documentData;
		this._bytes = _bytes;
		this._width = _width;
		this._height = _height;
	}

	public static empty(): GeoTIFFRaw {
		return new GeoTIFFRaw(new Uint8Array(), 0, 0, 0);
	}

	public static create(rawdata: Uint8Array): GeoTIFFRaw {

		const ifd = tiff.decode(rawdata)[0]
		const header_size = 70;

		const width = ifd.width;
		const height = ifd.height;
		const image_size = width * height * 4;

		const arr = new Uint8Array(header_size + image_size);
		const view = new DataView(arr.buffer);
		// BM magic number.
		view.setUint16(0, 0x424D, false);
		// File size.
		view.setUint32(2, arr.length, true);
		// Offset to image data.
		view.setUint32(10, header_size, true);

		// BITMAPINFOHEADER

		// Size of BITMAPINFOHEADER
		view.setUint32(14, 40, true);
		// Width
		view.setInt32(18, width, true);
		// Height (signed because negative values flip
		// the image vertically).
		view.setInt32(22, height, true);
		// Number of colour planes (colours stored as
		// separate images; must be 1).
		view.setUint16(26, 1, true);
		// Bits per pixel.
		view.setUint16(28, 32, true);
		// Compression method, 6 = BI_ALPHABITFIELDS
		view.setUint32(30, 6, true);
		// Image size in bytes.
		view.setUint32(34, image_size, true);
		// Horizontal resolution, pixels per metre.
		// This will be unused in this situation.
		view.setInt32(38, 10000, true);
		// Vertical resolution, pixels per metre.
		view.setInt32(42, 10000, true);
		// Number of colours. 0 = all
		view.setUint32(46, 0, true);
		// Number of important colours. 0 = all
		view.setUint32(50, 0, true);

		// Colour table. Because we used BI_ALPHABITFIELDS
		// this specifies the R, G, B and A bitmasks.

		// Red
		view.setUint32(54, 0x000000FF, true);
		// Green
		view.setUint32(58, 0x0000FF00, true);
		// Blue
		view.setUint32(62, 0x00FF0000, true);
		// Alpha
		view.setUint32(66, 0xFF000000, true);

		// Find min and max of image
		let min = Number.MAX_VALUE
		let max = Number.MIN_VALUE
		for (let w = 0; w < width; ++w) {
			for (let h = 0; h < height; ++h) {
				const val = ifd.data[h*width + w];
				min = Math.min(min, val)
				max = Math.max(max, val)
			}
		}

		// Pixel data.
		for (let w = 0; w < width; ++w) {
			for (let h = 0; h < height; ++h) {
				const offset = header_size + (h * width + w) * 4;
				let val = ifd.data[h*width + w];
				val = (val - min)/(max - min)
				arr[offset + 0] = 255*val;  // R value
				arr[offset + 1] = 255*val;  // G value
				arr[offset + 2] = 255*val; 	// B value
				arr[offset + 3] = 255;//255*val; 	// A value
			}
		}

		const kbytes = rawdata.length/1000;
		return new GeoTIFFRaw(arr, kbytes, width, height)

	}

	readonly _documentData: Uint8Array;
	readonly _bytes: number;
	readonly _width: number;
	readonly _height: number;

}

/**
 * Define the document (the data model) used for paw draw files.
 */
class GeoTIFFDocument extends Disposable implements vscode.CustomDocument {

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined,
		delegate: GeoTIFFDocumentDelegate,
	): Promise<GeoTIFFDocument | PromiseLike<GeoTIFFDocument>> {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const fileData = await GeoTIFFDocument.readFile(dataFile);
		return new GeoTIFFDocument(uri, fileData, delegate);
	}

	private static async readFile(uri: vscode.Uri): Promise<GeoTIFFRaw> {
		if (uri.scheme === 'untitled') {
			return GeoTIFFRaw.empty();
		}
		const output = new Uint8Array(await vscode.workspace.fs.readFile(uri));
		return GeoTIFFRaw.create(output);
	}

	private readonly _uri: vscode.Uri;
	private readonly _delegate: GeoTIFFDocumentDelegate;
	readonly _raw: GeoTIFFRaw;

	private constructor(
		uri: vscode.Uri,
		raw: GeoTIFFRaw,
		delegate: GeoTIFFDocumentDelegate
	) {
		super();
		this._uri = uri;
		this._raw = raw;
		this._delegate = delegate;
	}

	public get uri() { return this._uri; }

	public get documentData(): Uint8Array { return this._raw._documentData; }


	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
		readonly content?: Uint8Array;
	}>());
	/**
	 * Fired to notify webviews that the document has changed.
	 */
	public readonly onDidChangeContent = this._onDidChangeDocument.event;

	private readonly _onDidChange = this._register(new vscode.EventEmitter<{
		readonly label: string,
		undo(): void,
		redo(): void,
	}>());
	/**
	 * Fired to tell VS Code that an edit has occurred in the document.
	 *
	 * This updates the document's dirty indicator.
	 */
	public readonly onDidChange = this._onDidChange.event;

	/**
	 * Called by VS Code when there are no more references to the document.
	 *
	 * This happens when all editors for it have been closed.
	 */
	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}

}

class GeoTIFFStatusBarInfo {

	static itemShape: vscode.StatusBarItem;
	static itemBytes: vscode.StatusBarItem;

	public static register(context: vscode.ExtensionContext): void {

		GeoTIFFStatusBarInfo.itemShape = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		GeoTIFFStatusBarInfo.itemBytes = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

//		const myCommandId = 'vs-geotiff.GeoTIFFInfo.show';
//		context.subscriptions.push(vscode.commands.registerCommand(myCommandId, () => {
//			const n = 0;//getNumberOfSelectedLines(vscode.window.activeTextEditor);
//			vscode.window.showInformationMessage(`Yeah, ${n} line(s) selected... Keep going!`);
//		}));

		// create a new status bar item that we can now manage
//		GeoTIFFStatusBarInfo.itemShape.command = myCommandId;
	

//		context.subscriptions.push(GeoTIFFStatusBarInfo.itemBytes);
//		context.subscriptions.push(GeoTIFFStatusBarInfo.itemShape);

	}

	public static hideStatusBar(): void {
		this.itemShape.hide();
		this.itemBytes.hide();
	}

	public static updateStatusBar(document: GeoTIFFDocument): void {
		
		GeoTIFFStatusBarInfo.itemShape.text = `${document._raw._width}x${document._raw._height}`;
		GeoTIFFStatusBarInfo.itemShape.show();

		if(document._raw._bytes > 1000){
			GeoTIFFStatusBarInfo.itemBytes.text = `${(document._raw._bytes / 1000).toFixed(2)}MB`;
			GeoTIFFStatusBarInfo.itemBytes.show();
		} else {

			GeoTIFFStatusBarInfo.itemBytes.text = `${document._raw._bytes.toFixed(2)}KB`;
			GeoTIFFStatusBarInfo.itemBytes.show();
		}

	}

}

/**
 * Provider for paw draw editors.
 *
 * Paw draw editors are used for `.geotiff` files, which are just `.png` files with a different file extension.
 *
 * This provider demonstrates:
 *
 * - How to implement a custom editor for binary files.
 * - Setting up the initial webview for a custom editor.
 * - Loading scripts and styles in a custom editor.
 * - Communication between VS Code and the custom editor.
 * - Using CustomDocuments to store information that is shared between multiple custom editors.
 * - Implementing save, undo, redo, and revert.
 * - Backing up a custom editor.
 */
export class GeoTIFFReadOnlyEditorProvider implements vscode.CustomReadonlyEditorProvider<GeoTIFFDocument> {

	private static readonly viewType = 'vsGeoTIFF.GeoTIFF';
	private readonly webviews = new WebviewCollection();
	private static OpenViewURI = new Map<string, GeoTIFFDocument>();

	constructor(private readonly _context: vscode.ExtensionContext){}

	public static register(context: vscode.ExtensionContext): void {

		// Register Custom Editor
		context.subscriptions.push(vscode.window.registerCustomEditorProvider(
			GeoTIFFReadOnlyEditorProvider.viewType,
			new GeoTIFFReadOnlyEditorProvider(context),
			{
			// For this demo extension, we enable `retainContextWhenHidden` which keeps the
			// webview alive even when it is not visible. You should avoid using this setting
			// unless is absolutely required as it does have memory overhead.
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		}));

		GeoTIFFStatusBarInfo.register(context);
				
		// Custom Editor Tab Management?

		context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs((event) => {

			if(event.changed.length > 0){

				let found: boolean = false;

				event.changed.forEach( (changed: vscode.Tab) => {
					if(changed.input instanceof vscode.TabInputCustom){
						if(changed.input.viewType == GeoTIFFReadOnlyEditorProvider.viewType){
							if(changed.isActive){
								let document = GeoTIFFReadOnlyEditorProvider.OpenViewURI.get(changed.input.uri.path)
								if(document instanceof GeoTIFFDocument){
									GeoTIFFStatusBarInfo.updateStatusBar(document);
									found = true;
								}
							}
						}
					} 
				});

				if(found == false){
					GeoTIFFStatusBarInfo.hideStatusBar()
				}

			}

			if(event.closed.length > 0){

				event.closed.forEach( (closed: vscode.Tab) => {
					if(closed.input instanceof vscode.TabInputCustom){
						if(closed.input.viewType == GeoTIFFReadOnlyEditorProvider.viewType){
							GeoTIFFReadOnlyEditorProvider.OpenViewURI.delete(closed.input.uri.path)
						}
					} 
				});
	
				if(GeoTIFFReadOnlyEditorProvider.OpenViewURI.size == 0){
					GeoTIFFStatusBarInfo.hideStatusBar()
				}

			}

		}));

	}

	async openCustomDocument(
		uri: vscode.Uri,
		openContext: { backupId?: string },
		_token: vscode.CancellationToken
	): Promise<GeoTIFFDocument> {

		const document: GeoTIFFDocument = await GeoTIFFDocument.create(uri, openContext.backupId, {
			getFileData: async () => {
				const webviewsForDocument = Array.from(this.webviews.get(document.uri));
				if (!webviewsForDocument.length) {
					throw new Error('Could not find webview to save for');
				}
				const panel = webviewsForDocument[0];
				const response = await this.postMessageWithResponse<number[]>(panel, 'getFileData', {});
				return new Uint8Array(response);
			}
		});

		GeoTIFFReadOnlyEditorProvider.OpenViewURI.set(document.uri.path, document);
		GeoTIFFStatusBarInfo.updateStatusBar(document);

		const listeners: vscode.Disposable[] = [];

		listeners.push(document.onDidChangeContent(e => {
			// Update all webviews when the document changes
			for (const webviewPanel of this.webviews.get(document.uri)) {
				this.postMessage(webviewPanel, 'update', {
					content: e.content,
				});
			}
			GeoTIFFStatusBarInfo.updateStatusBar(document);
		}));

		document.onDidDispose(() => disposeAll(listeners));
		return document;
		
	}

	async resolveCustomEditor(
		document: GeoTIFFDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === 'ready') {
				if (document.uri.scheme === 'untitled') {
					this.postMessage(webviewPanel, 'init', {
						untitled: true,
						editable: true,
					});
				} else {
					const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);

					this.postMessage(webviewPanel, 'init', {
						value: document.documentData,
						editable,
					});
				}
			}
		});
//		GeoTIFFStatusBarInfo.updateStatusBar(document);
	}

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<GeoTIFFDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	//#endregion

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'GeoTIFF.js'));

		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'reset.css'));

		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'vscode.css'));

		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'GeoTIFF.css'));

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet" />
				<link href="${styleVSCodeUri}" rel="stylesheet" />
				<link href="${styleMainUri}" rel="stylesheet" />

				<title>Paw Draw</title>
			</head>
			<body>
				<div class="drawing-canvas"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();

	private postMessageWithResponse<R = unknown>(panel: vscode.WebviewPanel, type: string, body: any): Promise<R> {
		const requestId = this._requestId++;
		const p = new Promise<R>(resolve => this._callbacks.set(requestId, resolve));
		panel.webview.postMessage({ type, requestId, body });
		return p;
	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage(document: GeoTIFFDocument, message: any) {
		switch (message.type) {
			case 'response':
				{
					const callback = this._callbacks.get(message.requestId);
					callback?.(message.body);
					return;
				}
		}
	}
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {

	private readonly _webviews = new Set<{
		readonly resource: string;
		readonly webviewPanel: vscode.WebviewPanel;
	}>();

	/**
	 * Get all known webviews for a given uri.
	 */
	public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
		const key = uri.toString();
		for (const entry of this._webviews) {
			if (entry.resource === key) {
				yield entry.webviewPanel;
			}
		}
	}

	/**
	 * Add a new webview to the collection.
	 */
	public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
		const entry = { resource: uri.toString(), webviewPanel };
		this._webviews.add(entry);

		webviewPanel.onDidDispose(() => {
			this._webviews.delete(entry);
		});
	}
}
