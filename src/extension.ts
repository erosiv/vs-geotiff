import * as vscode from 'vscode';
import { GeoTIFFReadOnlyEditorProvider, GeoTIFFStatusBarInfo } from './GeoTIFFReadOnlyEditor';

export function activate(context: vscode.ExtensionContext) {
	// Register our custom editor providers
	context.subscriptions.push(GeoTIFFReadOnlyEditorProvider.register(context));
	GeoTIFFStatusBarInfo.register(context);
}