export interface IBrowserOptions {
	timeout?: number;
	sessionId?: string;
}

export interface IScreenshotOptions {
	fullPage?: boolean;
	path?: string;
}

export interface IDownloadOptions {
	clickTimeout?: number;
	waitTimeout?: number;
	preferPopupPage?: boolean;
}

export type DownloadSource = 'element' | 'url';
export type BrowserConnectionMode = 'cdp' | 'ws';
export type BrowserType = 'firefox' | 'chromium';
