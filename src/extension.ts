import * as vscode from 'vscode';
import { GeoTIFFReadOnlyEditorProvider } from './GeoTIFFReadOnlyEditor';

export function activate(context: vscode.ExtensionContext) {
	GeoTIFFReadOnlyEditorProvider.register(context)
}