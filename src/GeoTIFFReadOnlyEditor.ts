import * as vscode from 'vscode';
import { Disposable, disposeAll } from './dispose';
import { getNonce } from './util';
import * as tiff from 'tiff'
import {Bitmap, shade_grayscale, shade_turbo} from './shade'

type DataArray = Uint8Array | Uint16Array | Float32Array;

class GeoTIFFRaw {
	
	private readonly _raw: DataArray;
	private readonly _bytes: number;
	private readonly _min: number;
	private readonly _max: number;
	_bitmap: Bitmap;

	constructor(source: Uint8Array | undefined){

		if(source instanceof Uint8Array){

			const ifd = tiff.decode(source)[0]
			const kbytes = source.length/1000;
			const width = ifd.width;
			const height = ifd.height;

			this._raw = ifd.data;
			this._bytes = kbytes;
			this._bitmap = new Bitmap(width, height)
			
			this._min = Number.MAX_VALUE
			this._max = Number.MIN_VALUE
			for(let p = 0; p < width*height; ++p){
				const val = ifd.data[p];
				this._min = Math.min(this._min, val)
				this._max = Math.max(this._max, val)
			}

		} else {

			this._raw = new Float32Array()
			this._bytes = 0
			this._bitmap = new Bitmap(0, 0)
			this._min = 0.0
			this._max = 0.0

		}

	}

	public get bytes() { return this._bytes; }
	public get width() { return this._bitmap._width; }
	public get height() { return this._bitmap._height; }

	public get min() { return this._min }
	public get max() { return this._max }

	//
	// Shading Functions
	//

	public shade_turbo(): void {
		shade_turbo(this._bitmap, this._raw, this._min, this._max)
	}

	public shade_grayscale(): void {
		shade_grayscale(this._bitmap, this._raw, this._min, this._max)
	}

}

class GeoTIFFStatusBarInfo {

	static itemColor: vscode.StatusBarItem;
	static itemShape: vscode.StatusBarItem;
	static itemBytes: vscode.StatusBarItem;

	public static register(context: vscode.ExtensionContext): void {

	 	GeoTIFFStatusBarInfo.itemColor = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		GeoTIFFStatusBarInfo.itemShape = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		GeoTIFFStatusBarInfo.itemBytes = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	
	}

	public static hideStatusBar(): void {
		this.itemColor.hide();
		this.itemShape.hide();
		this.itemBytes.hide();
	}

	public static updateStatusBar(geotiff: GeoTIFFRaw): void {
		
		GeoTIFFStatusBarInfo.itemColor.show();

		GeoTIFFStatusBarInfo.itemShape.text = `${geotiff.width}x${geotiff.height}`;
		GeoTIFFStatusBarInfo.itemShape.show();

		if(geotiff.bytes > 1000){
			GeoTIFFStatusBarInfo.itemBytes.text = `${(geotiff.bytes / 1000).toFixed(2)}MB`;
			GeoTIFFStatusBarInfo.itemBytes.show();
		} else {

			GeoTIFFStatusBarInfo.itemBytes.text = `${geotiff.bytes.toFixed(2)}KB`;
			GeoTIFFStatusBarInfo.itemBytes.show();
		}

	}

}

interface GeoTIFFDocumentDelegate {
	getFileData(): Promise<Uint8Array>;
}

/**
 * Define the document (the data model) used for paw draw files.
 */
class GeoTIFFDocument extends Disposable implements vscode.CustomDocument {

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
			return new GeoTIFFRaw(undefined);
		}
		const file = new GeoTIFFRaw(await vscode.workspace.fs.readFile(uri))
		file.shade_grayscale()
		return file;
	}

	// Getters

	public get uri() { return this._uri; }
	public get raw() { return this._raw; }
	public get documentData(): Uint8Array { return this._raw._bitmap._data; }

	// Event Handlers

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	public readonly onDidDispose = this._onDidDispose.event;

	public readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
		readonly content?: Uint8Array;
	}>());
	public readonly onDidChangeContent = this._onDidChangeDocument.event;

	public readonly _onDidChange = this._register(new vscode.EventEmitter<{
		readonly label: string,
		undo(): void,
		redo(): void,
	}>());
	public readonly onDidChange = this._onDidChange.event;

	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
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

		const myCommandId = 'vs-geotiff.GeoTIFFInfo.shade';
		context.subscriptions.push(vscode.commands.registerCommand(myCommandId, () => {

			vscode.window.showInformationMessage(`Selected Shade`);

			// how do force this to redraw the ???
			this.OpenViewURI.forEach((val, key) => {
				val._raw.shade_turbo()
				const test = {content: val._raw._bitmap._data}
				val._onDidChangeDocument.fire(test);
			});
		
		}));

		GeoTIFFStatusBarInfo.itemColor.text = `$(symbol-color) Turbo`;
		GeoTIFFStatusBarInfo.itemColor.command = myCommandId;
		context.subscriptions.push(GeoTIFFStatusBarInfo.itemColor);

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
									GeoTIFFStatusBarInfo.updateStatusBar(document.raw);
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
		GeoTIFFStatusBarInfo.updateStatusBar(document.raw);

		const listeners: vscode.Disposable[] = [];

		listeners.push(document.onDidChangeContent(e => {

			console.log("DOCUMENT APPEARS TO HAVE CHANGED")
			
			// Update all webviews when the document changes
			for (const webviewPanel of this.webviews.get(document.uri)) {
				this.postMessage(webviewPanel, 'update', {
					content: e.content,
				});
			}
			GeoTIFFStatusBarInfo.updateStatusBar(document.raw);
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
//		this._onDidDispose.fire();

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
